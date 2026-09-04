import { StatusCodes } from "http-status-codes";

import { deleteDocument as deleteCloudinaryAsset, uploadDocument as uploadToCloudinary } from "@/lib/cloudinary";
import { audit } from "@/lib/audit";
import { patientScopeFor } from "@/lib/scope";
import type { AuthenticatedUser } from "@/lib/types";
import { resourceTypeForMime } from "@/moduels/documents/documents.upload.middleware";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";
import type { UpdateDocumentInput, UploadDocumentInput } from "./documents.validation";

/**
 * Document-scope filter, mirroring patientScopeFor's shape but for a table
 * that is only SOMETIMES patient-linked: a document with no patientId is a
 * general clinic file everyone sees; a patient-linked one follows the same
 * ownership rule as the patient itself. Admin/super_admin see everything.
 */
function documentScopeFor(user: AuthenticatedUser): Record<string, unknown> {
	if (user.role === "admin" || user.role === "super_admin") return {};
	return { OR: [{ patientId: null }, { patient: patientScopeFor(user) }] };
}

async function assertPatientInScope(patientId: string, user: AuthenticatedUser): Promise<ServiceResponse<null> | null> {
	if (user.role === "admin" || user.role === "super_admin") return null;
	const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { assignedTo: true } });
	if (!patient) return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
	if (patient.assignedTo !== null && patient.assignedTo !== user.id) {
		return ServiceResponse.failure("You do not have access to this patient.", null, StatusCodes.FORBIDDEN);
	}
	return null;
}

export const documentsService = {
	// --- Folders -----------------------------------------------------------

	/** One level of the folder tree at a time — parentId omitted means root. */
	async listFolders(parentId: string | undefined) {
		const folders = await prisma.documentFolder.findMany({
			where: { parentFolderId: parentId ?? null },
			include: {
				createdBy: { select: { id: true, name: true } },
				_count: { select: { children: true, documents: true } },
			},
			orderBy: { name: "asc" },
		});
		return ServiceResponse.success("Folders retrieved.", folders);
	},

	async createFolder(input: { name: string; parentFolderId?: string | null }, actor: AuthenticatedUser) {
		if (input.parentFolderId) {
			const parent = await prisma.documentFolder.findUnique({ where: { id: input.parentFolderId } });
			if (!parent) return ServiceResponse.failure("Parent folder not found.", null, StatusCodes.NOT_FOUND);
		}
		const folder = await prisma.documentFolder.create({
			data: { name: input.name, parentFolderId: input.parentFolderId ?? null, createdById: actor.id },
		});
		await audit({
			user: actor,
			action: "document_folder.create",
			entityType: "document_folder",
			entityId: folder.id,
			newValue: { name: folder.name, parentFolderId: folder.parentFolderId },
			message: `${actor.name} created folder "${folder.name}"`,
			type: "manual",
			category: "system",
		});
		return ServiceResponse.success("Folder created.", folder, StatusCodes.CREATED);
	},

	async renameFolder(id: string, name: string, actor: AuthenticatedUser) {
		const existing = await prisma.documentFolder.findUnique({ where: { id } });
		if (!existing) return ServiceResponse.failure("Folder not found.", null, StatusCodes.NOT_FOUND);

		const folder = await prisma.documentFolder.update({ where: { id }, data: { name } });
		await audit({
			user: actor,
			action: "document_folder.rename",
			entityType: "document_folder",
			entityId: id,
			prevValue: { name: existing.name },
			newValue: { name },
			message: `${actor.name} renamed folder "${existing.name}" to "${name}"`,
			type: "manual",
			category: "system",
		});
		return ServiceResponse.success("Folder renamed.", folder);
	},

	/**
	 * Deletes a folder. Refuses if it has any subfolders or documents unless
	 * `force` is set — the DB cascade (schema.prisma) would happily delete
	 * everything underneath, but doing that silently on a plain delete click
	 * is exactly the kind of accidental-data-loss this app has been careful
	 * to avoid everywhere else.
	 */
	async deleteFolder(id: string, force: boolean, actor: AuthenticatedUser) {
		const folder = await prisma.documentFolder.findUnique({
			where: { id },
			include: { _count: { select: { children: true, documents: true } } },
		});
		if (!folder) return ServiceResponse.failure("Folder not found.", null, StatusCodes.NOT_FOUND);

		const totalContents = folder._count.children + folder._count.documents;
		if (totalContents > 0 && !force) {
			return ServiceResponse.failure(
				`This folder has ${folder._count.documents} file(s) and ${folder._count.children} subfolder(s). Move or delete them first, or confirm deleting everything inside.`,
				{ documentCount: folder._count.documents, subfolderCount: folder._count.children },
				StatusCodes.CONFLICT,
			);
		}

		// Document.folder is onDelete: SetNull, NOT Cascade (see schema.prisma —
		// deliberate: a document must never vanish just because its folder was
		// removed on the ordinary, non-force delete path). So a force-delete has
		// to explicitly delete every document under this folder tree itself —
		// deleting only their Cloudinary assets and letting the folder delete run
		// would leave orphaned DB rows pointing at now-nonexistent files. Only
		// DocumentFolder→DocumentFolder cascades on its own (subfolders really do
		// get removed for free when their parent is deleted).
		if (force && folder._count.documents > 0) {
			const allDescendantFolderIds = await collectDescendantFolderIds(id);
			const folderIds = [id, ...allDescendantFolderIds];
			const docsToDelete = await prisma.document.findMany({
				where: { folderId: { in: folderIds } },
				select: { id: true, cloudinaryPublicId: true, resourceType: true },
			});
			await Promise.allSettled(
				docsToDelete.map((d) => deleteCloudinaryAsset(d.cloudinaryPublicId, d.resourceType as "image" | "video" | "raw")),
			);
			await prisma.document.deleteMany({ where: { id: { in: docsToDelete.map((d) => d.id) } } });
		}

		await prisma.documentFolder.delete({ where: { id } });
		await audit({
			user: actor,
			action: "document_folder.delete",
			entityType: "document_folder",
			entityId: id,
			prevValue: { name: folder.name, documentCount: folder._count.documents, subfolderCount: folder._count.children },
			message: `${actor.name} deleted folder "${folder.name}"${force ? " and everything inside it" : ""}`,
			type: "manual",
			category: "system",
		});
		return ServiceResponse.success("Folder deleted.", null);
	},

	// --- Documents -----------------------------------------------------------

	async list(query: { folderId?: string; patientId?: string; search?: string; type?: string }, user: AuthenticatedUser) {
		const where: Record<string, unknown> = { AND: [documentScopeFor(user)] };
		const ands = where.AND as Record<string, unknown>[];

		if (query.folderId !== undefined) ands.push({ folderId: query.folderId });
		if (query.patientId !== undefined) ands.push({ patientId: query.patientId });
		if (query.type !== undefined) ands.push({ resourceType: query.type });
		if (query.search) ands.push({ fileName: { contains: query.search, mode: "insensitive" } });

		const documents = await prisma.document.findMany({
			where,
			include: {
				uploadedBy: { select: { id: true, name: true } },
				patient: { select: { id: true, firstName: true, lastName: true } },
				folder: { select: { id: true, name: true } },
			},
			orderBy: { createdAt: "desc" },
		});
		return ServiceResponse.success("Documents retrieved.", documents);
	},

	async upload(
		file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
		input: UploadDocumentInput,
		actor: AuthenticatedUser,
	) {
		if (input.folderId) {
			const folder = await prisma.documentFolder.findUnique({ where: { id: input.folderId } });
			if (!folder) return ServiceResponse.failure("Folder not found.", null, StatusCodes.NOT_FOUND);
		}
		if (input.patientId) {
			const scopeError = await assertPatientInScope(input.patientId, actor);
			if (scopeError) return scopeError;
		}

		const resourceType = resourceTypeForMime(file.mimetype);
		const uploaded = await uploadToCloudinary(file.buffer, file.originalname, resourceType, input.folderId ?? null);

		const document = await prisma.document.create({
			data: {
				folderId: input.folderId ?? null,
				patientId: input.patientId ?? null,
				fileName: file.originalname,
				mimeType: file.mimetype,
				sizeBytes: file.size,
				cloudinaryPublicId: uploaded.publicId,
				resourceType: uploaded.resourceType,
				url: uploaded.url,
				uploadedById: actor.id,
			},
			include: {
				uploadedBy: { select: { id: true, name: true } },
				patient: { select: { id: true, firstName: true, lastName: true } },
				folder: { select: { id: true, name: true } },
			},
		});

		await audit({
			patientId: input.patientId ?? null,
			user: actor,
			action: "document.upload",
			entityType: "document",
			entityId: document.id,
			newValue: { fileName: document.fileName, folderId: document.folderId },
			message: `${actor.name} uploaded "${document.fileName}"`,
			type: "manual",
			category: input.patientId ? "patient" : "system",
		});

		return ServiceResponse.success("Document uploaded.", document, StatusCodes.CREATED);
	},

	async update(id: string, input: UpdateDocumentInput, actor: AuthenticatedUser) {
		const existing = await prisma.document.findUnique({ where: { id } });
		if (!existing) return ServiceResponse.failure("Document not found.", null, StatusCodes.NOT_FOUND);
		if (existing.patientId) {
			const scopeError = await assertPatientInScope(existing.patientId, actor);
			if (scopeError) return scopeError;
		}
		if (input.folderId) {
			const folder = await prisma.documentFolder.findUnique({ where: { id: input.folderId } });
			if (!folder) return ServiceResponse.failure("Folder not found.", null, StatusCodes.NOT_FOUND);
		}

		const document = await prisma.document.update({
			where: { id },
			data: {
				...(input.fileName !== undefined && { fileName: input.fileName }),
				...(input.folderId !== undefined && { folderId: input.folderId }),
			},
			include: {
				uploadedBy: { select: { id: true, name: true } },
				patient: { select: { id: true, firstName: true, lastName: true } },
				folder: { select: { id: true, name: true } },
			},
		});

		await audit({
			patientId: existing.patientId,
			user: actor,
			action: "document.update",
			entityType: "document",
			entityId: id,
			prevValue: { fileName: existing.fileName, folderId: existing.folderId },
			newValue: { fileName: document.fileName, folderId: document.folderId },
			message: `${actor.name} updated "${existing.fileName}"`,
			type: "manual",
			category: existing.patientId ? "patient" : "system",
		});

		return ServiceResponse.success("Document updated.", document);
	},

	async delete(id: string, actor: AuthenticatedUser) {
		const existing = await prisma.document.findUnique({ where: { id } });
		if (!existing) return ServiceResponse.failure("Document not found.", null, StatusCodes.NOT_FOUND);
		if (existing.patientId) {
			const scopeError = await assertPatientInScope(existing.patientId, actor);
			if (scopeError) return scopeError;
		}

		// Cloudinary delete BEFORE the DB row — if this throws, the row survives
		// so the failure is visible (an orphaned Cloudinary asset with a live DB
		// row still pointing at it is recoverable; the reverse, a DB row deleted
		// while the asset silently fails to delete, would leak storage forever
		// with no trace).
		await deleteCloudinaryAsset(existing.cloudinaryPublicId, existing.resourceType as "image" | "video" | "raw");
		await prisma.document.delete({ where: { id } });

		await audit({
			patientId: existing.patientId,
			user: actor,
			action: "document.delete",
			entityType: "document",
			entityId: id,
			prevValue: { fileName: existing.fileName },
			message: `${actor.name} deleted "${existing.fileName}"`,
			type: "manual",
			category: existing.patientId ? "patient" : "system",
		});

		return ServiceResponse.success("Document deleted.", null);
	},
};

/** BFS over the folder tree to find every descendant folder id, for the "delete folder and everything inside" cascade cleanup. */
async function collectDescendantFolderIds(rootId: string): Promise<string[]> {
	const result: string[] = [];
	let frontier = [rootId];
	while (frontier.length > 0) {
		const children = await prisma.documentFolder.findMany({
			where: { parentFolderId: { in: frontier } },
			select: { id: true },
		});
		if (children.length === 0) break;
		const ids = children.map((c) => c.id);
		result.push(...ids);
		frontier = ids;
	}
	return result;
}
