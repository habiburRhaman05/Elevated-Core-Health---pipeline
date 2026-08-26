import { z } from "zod";

export const ConversationIdParamSchema = z.object({
	params: z.object({ id: z.string().min(1) }),
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

const MessageBodySchema = z.object({
	body: z.string().trim().max(8000, "Message is too long (max 8000 characters)").optional(),
	attachments: z.array(AttachmentRefSchema).max(10, "Attach at most 10 files per message").optional(),
	/** Set when this message is a reply — must belong to the same conversation, checked server-side. */
	replyToId: z.string().min(1).optional(),
});

// A message needs SOMETHING — text or at least one attachment, matching the
// "attachment-only message" convention described in the Prisma schema.
const hasContent = (v: z.infer<typeof MessageBodySchema>) =>
	(v.body && v.body.length > 0) || (v.attachments && v.attachments.length > 0);
const CONTENT_REQUIRED_MESSAGE = "Message can't be empty — write something or attach a file";

/** Sending into a conversation the caller already belongs to (:id is real). */
export const SendInternalMessageSchema = z.object({
	params: z.object({ id: z.string().min(1) }),
	body: MessageBodySchema.refine(hasContent, { message: CONTENT_REQUIRED_MESSAGE }),
});

/**
 * Phase 2 — sending to a teammate with no conversation yet (the auto-synced
 * sidebar's "click a name, type, send" flow). No :id in the URL because none
 * exists — the conversation is found-or-created inside the service as part
 * of this same call. See internal-messaging.service.ts's resolveConversation.
 */
export const SendLazyInternalMessageSchema = z.object({
	body: MessageBodySchema.extend({
		recipientUserId: z.string().min(1, "Select a teammate to message"),
	}).refine(hasContent, { message: CONTENT_REQUIRED_MESSAGE }),
});

/** Typing indicator — targets either an existing conversation or (for a
 *  brand-new chat) a recipient directly. Exactly one of the two. */
export const TypingSchema = z.object({
	body: z
		.object({
			conversationId: z.string().min(1).optional(),
			recipientUserId: z.string().min(1).optional(),
		})
		.refine((v) => Boolean(v.conversationId) !== Boolean(v.recipientUserId), {
			message: "Provide exactly one of conversationId or recipientUserId",
		}),
});
