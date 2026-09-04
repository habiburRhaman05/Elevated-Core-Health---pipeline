import { StatusCodes } from "http-status-codes";

import { audit, type RequestContext } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import type { AuthenticatedUser } from "@/lib/types";
import { AppError } from "@/utils/appError";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";
import type {
	CreateEntryInput,
	CreateGroupInput,
	RenameGroupInput,
	SetEntryAccessInput,
	SetGroupAccessInput,
	UpdateEntryInput,
} from "./password-vault.validation";

const noContext: RequestContext = { ip: null, userAgent: null };

const accessUserSelect = { select: { id: true, name: true } } as const;

const entryListInclude = {
	group: { select: { id: true, name: true } },
	access: { include: { user: accessUserSelect } },
} as const;

/**
 * Every list/read response below is deliberately built by hand (never a bare
 * `prisma.passwordEntry.findMany()` spread into JSON) so secretCipher/
 * secretIv/secretAuthTag can never accidentally leak into an API response —
 * decryption only ever happens inside revealEntry()/revealMyEntry(), which
 * are the only two places a plaintext password is allowed to exist.
 */
function toEntryDto(entry: {
	id: string;
	name: string;
	username: string | null;
	notes: string | null;
	groupId: string | null;
	createdAt: Date;
	updatedAt: Date;
	group: { id: string; name: string } | null;
	access: Array<{ user: { id: string; name: string } }>;
}) {
	return {
		id: entry.id,
		name: entry.name,
		username: entry.username,
		notes: entry.notes,
		group: entry.group,
		access: entry.access.map((a) => a.user),
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
	};
}

async function assertUserIdsExist(userIds: string[]) {
	if (userIds.length === 0) return;
	const found = await prisma.user.count({ where: { id: { in: userIds } } });
	if (found !== userIds.length) {
		throw AppError.badRequest("One or more selected users don't exist.");
	}
}

export const passwordVaultService = {
	// ---------------------------------------------------------------- groups
	async listGroups() {
		const groups = await prisma.passwordGroup.findMany({
			orderBy: { name: "asc" },
			include: {
				access: { include: { user: accessUserSelect } },
				_count: { select: { entries: true } },
			},
		});
		return ServiceResponse.success(
			"Groups retrieved.",
			groups.map((g) => ({
				id: g.id,
				name: g.name,
				access: g.access.map((a) => a.user),
				entryCount: g._count.entries,
				createdAt: g.createdAt,
			})),
		);
	},

	async createGroup(input: CreateGroupInput, actor: AuthenticatedUser, ctx: RequestContext = noContext) {
		const group = await prisma.passwordGroup.create({
			data: { name: input.name, createdById: actor.id },
		});
		await audit({
			user: actor,
			action: "password_vault.group_created",
			category: "system",
			entityType: "password_group",
			entityId: group.id,
			message: `${actor.name} created password group "${group.name}"`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Group created.", group, StatusCodes.CREATED);
	},

	async renameGroup(id: string, input: RenameGroupInput, actor: AuthenticatedUser, ctx: RequestContext = noContext) {
		const existing = await prisma.passwordGroup.findUnique({ where: { id } });
		if (!existing) return ServiceResponse.failure("Group not found.", null, StatusCodes.NOT_FOUND);

		const group = await prisma.passwordGroup.update({ where: { id }, data: { name: input.name } });
		await audit({
			user: actor,
			action: "password_vault.group_renamed",
			category: "system",
			entityType: "password_group",
			entityId: id,
			prevValue: { name: existing.name },
			newValue: { name: group.name },
			message: `${actor.name} renamed password group "${existing.name}" to "${group.name}"`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Group renamed.", group);
	},

	// Entries inside are ungrouped (groupId -> null via onDelete: SetNull), never deleted.
	async deleteGroup(id: string, actor: AuthenticatedUser, ctx: RequestContext = noContext) {
		const existing = await prisma.passwordGroup.findUnique({ where: { id } });
		if (!existing) return ServiceResponse.failure("Group not found.", null, StatusCodes.NOT_FOUND);

		await prisma.passwordGroup.delete({ where: { id } });
		await audit({
			user: actor,
			action: "password_vault.group_deleted",
			category: "system",
			entityType: "password_group",
			entityId: id,
			message: `${actor.name} deleted password group "${existing.name}" — its entries were ungrouped, not deleted`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Group deleted.", null);
	},

	async setGroupAccess(
		id: string,
		input: SetGroupAccessInput,
		actor: AuthenticatedUser,
		ctx: RequestContext = noContext,
	) {
		const existing = await prisma.passwordGroup.findUnique({ where: { id } });
		if (!existing) return ServiceResponse.failure("Group not found.", null, StatusCodes.NOT_FOUND);
		await assertUserIdsExist(input.userIds);

		await prisma.$transaction([
			prisma.passwordGroupAccess.deleteMany({ where: { groupId: id } }),
			prisma.passwordGroupAccess.createMany({
				data: input.userIds.map((userId) => ({ groupId: id, userId })),
			}),
		]);

		const grantedUsers = input.userIds.length
			? await prisma.user.findMany({ where: { id: { in: input.userIds } }, select: { name: true } })
			: [];
		await audit({
			user: actor,
			action: "password_vault.group_access_changed",
			category: "system",
			entityType: "password_group",
			entityId: id,
			newValue: { userIds: input.userIds },
			message:
				grantedUsers.length > 0
					? `${actor.name} shared password group "${existing.name}" with ${grantedUsers.map((u) => u.name).join(", ")}`
					: `${actor.name} cleared all access to password group "${existing.name}"`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Group access updated.", null);
	},

	// --------------------------------------------------------------- entries
	async listEntries() {
		const entries = await prisma.passwordEntry.findMany({
			orderBy: { name: "asc" },
			include: entryListInclude,
		});
		return ServiceResponse.success("Entries retrieved.", entries.map(toEntryDto));
	},

	async createEntry(input: CreateEntryInput, actor: AuthenticatedUser, ctx: RequestContext = noContext) {
		if (input.groupId) {
			const group = await prisma.passwordGroup.findUnique({ where: { id: input.groupId } });
			if (!group) return ServiceResponse.failure("Group not found.", null, StatusCodes.BAD_REQUEST);
		}
		await assertUserIdsExist(input.userIds);

		const encrypted = encryptSecret(input.password);
		const entry = await prisma.passwordEntry.create({
			data: {
				name: input.name,
				username: input.username ?? null,
				notes: input.notes ?? null,
				groupId: input.groupId ?? null,
				secretCipher: encrypted.cipher,
				secretIv: encrypted.iv,
				secretAuthTag: encrypted.authTag,
				createdById: actor.id,
				updatedById: actor.id,
				access: { createMany: { data: input.userIds.map((userId) => ({ userId })) } },
			},
			include: entryListInclude,
		});

		await audit({
			user: actor,
			action: "password_vault.entry_created",
			category: "system",
			entityType: "password_entry",
			entityId: entry.id,
			message: `${actor.name} added password "${entry.name}" to the vault`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Password added.", toEntryDto(entry), StatusCodes.CREATED);
	},

	async updateEntry(id: string, input: UpdateEntryInput, actor: AuthenticatedUser, ctx: RequestContext = noContext) {
		const existing = await prisma.passwordEntry.findUnique({ where: { id } });
		if (!existing) return ServiceResponse.failure("Password not found.", null, StatusCodes.NOT_FOUND);

		if (input.groupId) {
			const group = await prisma.passwordGroup.findUnique({ where: { id: input.groupId } });
			if (!group) return ServiceResponse.failure("Group not found.", null, StatusCodes.BAD_REQUEST);
		}

		const data: Record<string, unknown> = { updatedById: actor.id };
		if (input.name !== undefined) data.name = input.name;
		if (input.username !== undefined) data.username = input.username;
		if (input.notes !== undefined) data.notes = input.notes;
		if (input.groupId !== undefined) data.groupId = input.groupId;
		let rotated = false;
		if (input.password) {
			const encrypted = encryptSecret(input.password);
			data.secretCipher = encrypted.cipher;
			data.secretIv = encrypted.iv;
			data.secretAuthTag = encrypted.authTag;
			rotated = true;
		}

		const entry = await prisma.passwordEntry.update({ where: { id }, data, include: entryListInclude });

		await audit({
			user: actor,
			action: "password_vault.entry_updated",
			category: "system",
			entityType: "password_entry",
			entityId: id,
			message: rotated
				? `${actor.name} updated "${entry.name}" and rotated its password`
				: `${actor.name} updated "${entry.name}"`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Password updated.", toEntryDto(entry));
	},

	async deleteEntry(id: string, actor: AuthenticatedUser, ctx: RequestContext = noContext) {
		const existing = await prisma.passwordEntry.findUnique({ where: { id } });
		if (!existing) return ServiceResponse.failure("Password not found.", null, StatusCodes.NOT_FOUND);

		await prisma.passwordEntry.delete({ where: { id } });
		await audit({
			user: actor,
			action: "password_vault.entry_deleted",
			category: "system",
			entityType: "password_entry",
			entityId: id,
			message: `${actor.name} deleted password "${existing.name}" from the vault`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Password deleted.", null);
	},

	async setEntryAccess(
		id: string,
		input: SetEntryAccessInput,
		actor: AuthenticatedUser,
		ctx: RequestContext = noContext,
	) {
		const existing = await prisma.passwordEntry.findUnique({ where: { id } });
		if (!existing) return ServiceResponse.failure("Password not found.", null, StatusCodes.NOT_FOUND);
		await assertUserIdsExist(input.userIds);

		await prisma.$transaction([
			prisma.passwordEntryAccess.deleteMany({ where: { entryId: id } }),
			prisma.passwordEntryAccess.createMany({
				data: input.userIds.map((userId) => ({ entryId: id, userId })),
			}),
		]);

		const grantedUsers = input.userIds.length
			? await prisma.user.findMany({ where: { id: { in: input.userIds } }, select: { name: true } })
			: [];
		await audit({
			user: actor,
			action: "password_vault.entry_access_changed",
			category: "system",
			entityType: "password_entry",
			entityId: id,
			newValue: { userIds: input.userIds },
			message:
				grantedUsers.length > 0
					? `${actor.name} shared password "${existing.name}" with ${grantedUsers.map((u) => u.name).join(", ")}`
					: `${actor.name} cleared direct access to password "${existing.name}"`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Access updated.", null);
	},

	/** Admin reveal — admins bypass the access-grant system entirely (they own the vault), but the reveal itself is still audited. */
	async revealEntry(id: string, actor: AuthenticatedUser, ctx: RequestContext = noContext) {
		const entry = await prisma.passwordEntry.findUnique({ where: { id } });
		if (!entry) return ServiceResponse.failure("Password not found.", null, StatusCodes.NOT_FOUND);

		const password = decryptSecret({
			cipher: entry.secretCipher,
			iv: entry.secretIv,
			authTag: entry.secretAuthTag,
		});

		await audit({
			user: actor,
			action: "password_vault.entry_revealed",
			category: "system",
			entityType: "password_entry",
			entityId: id,
			message: `${actor.name} revealed the password for "${entry.name}"`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Password revealed.", { password });
	},

	// ------------------------------------------------------------- VA access
	/** Entries a VA can see: direct grant OR their group is shared. Computed in the WHERE clause — never "fetch all, filter in JS". */
	async listMyEntries(actor: AuthenticatedUser) {
		const entries = await prisma.passwordEntry.findMany({
			where: {
				OR: [{ access: { some: { userId: actor.id } } }, { group: { access: { some: { userId: actor.id } } } }],
			},
			orderBy: { name: "asc" },
			include: entryListInclude,
		});
		// A VA doesn't need to see the full access list (who else can see it) —
		// only the entries themselves, name/username/group.
		return ServiceResponse.success(
			"Entries retrieved.",
			entries.map((e) => {
				const dto = toEntryDto(e);
				const { access: _access, ...rest } = dto;
				return rest;
			}),
		);
	},

	/** Re-checks access here too — never trust that a VA only ever calls this for ids the list endpoint gave them. */
	async revealMyEntry(id: string, actor: AuthenticatedUser, ctx: RequestContext = noContext) {
		const entry = await prisma.passwordEntry.findFirst({
			where: {
				id,
				OR: [{ access: { some: { userId: actor.id } } }, { group: { access: { some: { userId: actor.id } } } }],
			},
		});
		if (!entry) {
			return ServiceResponse.failure("Password not found.", null, StatusCodes.NOT_FOUND);
		}

		const password = decryptSecret({
			cipher: entry.secretCipher,
			iv: entry.secretIv,
			authTag: entry.secretAuthTag,
		});

		await audit({
			user: actor,
			action: "password_vault.entry_revealed",
			category: "system",
			entityType: "password_entry",
			entityId: id,
			message: `${actor.name} revealed the password for "${entry.name}"`,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});
		return ServiceResponse.success("Password revealed.", { password });
	},
};
