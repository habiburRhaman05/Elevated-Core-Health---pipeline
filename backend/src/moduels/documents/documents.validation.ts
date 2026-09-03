import { z } from "zod";

const uuid = z.string().uuid();

export const CreateFolderSchema = z.object({
	body: z.object({
		name: z.string().trim().min(1, "Folder name is required").max(150),
		parentFolderId: uuid.optional().nullable(),
	}),
});
export type CreateFolderInput = z.infer<typeof CreateFolderSchema>["body"];

export const RenameFolderSchema = z.object({
	body: z.object({
		name: z.string().trim().min(1, "Folder name is required").max(150),
	}),
});
export type RenameFolderInput = z.infer<typeof RenameFolderSchema>["body"];

export const ListFoldersSchema = z.object({
	query: z.object({
		parentId: uuid.optional(),
	}),
});

export const ListDocumentsSchema = z.object({
	query: z.object({
		folderId: uuid.optional(),
		patientId: uuid.optional(),
		search: z.string().trim().max(200).optional(),
		type: z.enum(["image", "video", "raw"]).optional(),
	}),
});
export type ListDocumentsQuery = z.infer<typeof ListDocumentsSchema>["query"];

// Multipart body fields arrive as plain strings (multer), never JSON-typed —
// "" is treated the same as absent so an empty form field doesn't get read as
// a literal folder/patient id.
const optionalUuidFormField = z.preprocess(
	(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
	uuid.optional(),
);

export const UploadDocumentSchema = z.object({
	body: z.object({
		folderId: optionalUuidFormField,
		patientId: optionalUuidFormField,
	}),
});
export type UploadDocumentInput = z.infer<typeof UploadDocumentSchema>["body"];

export const UpdateDocumentSchema = z.object({
	body: z.object({
		fileName: z.string().trim().min(1).max(255).optional(),
		// Explicit null (not just absent) moves the document to the Uncategorized root.
		folderId: uuid.nullable().optional(),
	}),
});
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>["body"];
