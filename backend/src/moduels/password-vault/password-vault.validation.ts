import { z } from "zod";

const uuid = z.string().uuid();

export const CreateGroupSchema = z.object({
	body: z.object({
		name: z.string().trim().min(1, "Group name is required").max(150),
	}),
});
export type CreateGroupInput = z.infer<typeof CreateGroupSchema>["body"];

export const RenameGroupSchema = z.object({
	body: z.object({
		name: z.string().trim().min(1, "Group name is required").max(150),
	}),
});
export type RenameGroupInput = z.infer<typeof RenameGroupSchema>["body"];

export const SetGroupAccessSchema = z.object({
	body: z.object({
		userIds: z.array(uuid),
	}),
});
export type SetGroupAccessInput = z.infer<typeof SetGroupAccessSchema>["body"];

export const CreateEntrySchema = z.object({
	body: z.object({
		name: z.string().trim().min(1, "Name is required").max(150),
		username: z.string().trim().max(150).optional().nullable(),
		password: z.string().min(1, "Password is required").max(500),
		notes: z.string().trim().max(2000).optional().nullable(),
		groupId: uuid.optional().nullable(),
		// Share-on-create — the same checkbox list the create form shows, applied
		// immediately rather than requiring a second "now edit access" step.
		userIds: z.array(uuid).optional().default([]),
	}),
});
export type CreateEntryInput = z.infer<typeof CreateEntrySchema>["body"];

export const UpdateEntrySchema = z.object({
	body: z.object({
		name: z.string().trim().min(1).max(150).optional(),
		username: z.string().trim().max(150).optional().nullable(),
		// Present + non-empty means "rotate the password"; absent means "leave it alone" —
		// there is deliberately no way to submit an empty-string password.
		password: z.string().min(1).max(500).optional(),
		notes: z.string().trim().max(2000).optional().nullable(),
		groupId: uuid.optional().nullable(),
	}),
});
export type UpdateEntryInput = z.infer<typeof UpdateEntrySchema>["body"];

export const SetEntryAccessSchema = z.object({
	body: z.object({
		userIds: z.array(uuid),
	}),
});
export type SetEntryAccessInput = z.infer<typeof SetEntryAccessSchema>["body"];
