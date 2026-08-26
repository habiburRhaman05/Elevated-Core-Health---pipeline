import { z } from "zod";

export const ConversationIdParamSchema = z.object({
	params: z.object({ id: z.string().min(1) }),
});

export const StartConversationSchema = z.object({
	body: z.object({
		userId: z.string().min(1, "Select a teammate to message"),
	}),
});

export const GetInternalMessagesQuerySchema = z.object({
	params: z.object({ id: z.string().min(1) }),
	query: z.object({
		page: z.coerce.number().int().positive().default(1),
		limit: z.coerce.number().int().positive().max(200).default(50),
	}),
});

/** Mirrors UploadedAttachment from lib/cloudinary.ts — the client attaches
 *  whatever POST /uploads handed back, verbatim, when it actually sends. */
const AttachmentRefSchema = z.object({
	type: z.enum(["image", "video", "audio", "file"]),
	url: z.string().url(),
	thumbnailUrl: z.string().url().nullable().optional(),
	fileName: z.string().min(1).max(255),
	mimeType: z.string().min(1).max(127),
	sizeBytes: z.coerce.number().int().nonnegative(),
	width: z.number().int().positive().nullable().optional(),
	height: z.number().int().positive().nullable().optional(),
	durationSeconds: z.number().int().positive().nullable().optional(),
});

export const SendInternalMessageSchema = z.object({
	params: z.object({ id: z.string().min(1) }),
	body: z
		.object({
			body: z.string().trim().max(8000, "Message is too long (max 8000 characters)").optional(),
			attachments: z.array(AttachmentRefSchema).max(10, "Attach at most 10 files per message").optional(),
		})
		// A message needs SOMETHING — text or at least one attachment, matching
		// the "attachment-only message" convention described in the schema.
		.refine((v) => (v.body && v.body.length > 0) || (v.attachments && v.attachments.length > 0), {
			message: "Message can't be empty — write something or attach a file",
		}),
});
