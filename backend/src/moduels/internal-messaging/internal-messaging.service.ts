import { Prisma } from "@/generated/prisma/client";
import { isCloudinaryConfigured, uploadInternalMessageAttachment } from "@/lib/cloudinary";
import {
	getPusherKey,
	notifyInternalConversationUpdated,
	notifyInternalNewMessage,
	notifyInternalTyping,
} from "@/lib/pusher";
import { broadcastToUser, broadcastToUsers } from "@/lib/realtime";
import type { AuthenticatedUser } from "@/lib/types";
import { AppError } from "@/utils/appError";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";

const SENDER_SELECT = { id: true, name: true, role: true, avatar: true } as const;

const ATTACHMENT_SELECT = {
	id: true,
	type: true,
	url: true,
	thumbnailUrl: true,
	fileName: true,
	mimeType: true,
	sizeBytes: true,
	width: true,
	height: true,
	durationSeconds: true,
} as const;

/** Trimmed-down quote for a reply preview — just enough to render "replying
 *  to: <snippet/thumbnail> — <sender>" without pulling the whole original
 *  message (which the client already has in its own cache if it's visible). */
const REPLY_TO_SELECT = {
	id: true,
	body: true,
	deletedAt: true,
	sender: { select: { id: true, name: true } },
	attachments: { select: { id: true, type: true, url: true, fileName: true }, take: 1 },
} as const;

const MESSAGE_INCLUDE = {
	sender: { select: SENDER_SELECT },
	attachments: { select: ATTACHMENT_SELECT },
	replyTo: { select: REPLY_TO_SELECT },
} as const;

type MessageWithRelations = Prisma.InternalMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

function messageDto(message: MessageWithRelations) {
	return {
		id: message.id,
		conversationId: message.conversationId,
		senderId: message.senderId,
		sender: message.sender,
		body: message.body,
		attachments: message.attachments,
		replyTo: message.replyTo
			? {
					id: message.replyTo.id,
					body: message.replyTo.body,
					senderId: message.replyTo.sender.id,
					senderName: message.replyTo.sender.name,
					attachmentPreview: message.replyTo.attachments[0] ?? null,
					deleted: message.replyTo.deletedAt !== null,
				}
			: null,
		editedAt: message.editedAt,
		deletedAt: message.deletedAt,
		createdAt: message.createdAt,
	};
}

/** Confirms `userId` is a participant of `conversationId`, throwing 404 rather
 *  than 403 — a non-participant shouldn't learn a DM exists at all. Returns
 *  every participant (including the caller) since most callers need the full
 *  roster next (to notify, to find "the other person", ...). */
async function requireParticipant(conversationId: string, userId: string) {
	const conversation = await prisma.internalConversation.findUnique({
		where: { id: conversationId },
		include: { participants: { select: { userId: true, lastReadAt: true } } },
	});
	if (!conversation) throw AppError.notFound("Conversation not found");
	const me = conversation.participants.find((p) => p.userId === userId);
	if (!me) throw AppError.notFound("Conversation not found");
	return { conversation, me };
}

/** True when `err` is Postgres' unique-violation for the given constraint —
 *  used to detect (and recover from) the race described on dmPairKey. */
function isUniqueViolationOn(err: unknown, target: string): boolean {
	return (
		err instanceof Prisma.PrismaClientKnownRequestError &&
		err.code === "P2002" &&
		(Array.isArray(err.meta?.target) ? err.meta.target.includes(target) : err.meta?.target === target)
	);
}

/** A message needs to land somewhere — either an existing conversation the
 *  caller already belongs to, or a fresh/lazy DM with a specific teammate
 *  (created on demand, see resolveConversation). Exactly one is ever set. */
export type MessageTarget = { conversationId: string } | { recipientUserId: string };

/**
 * Resolves `target` to a real conversation + its participant ids.
 *
 * The `recipientUserId` branch is the Phase 2 "auto-synced sidebar" path: no
 * conversation exists yet (the sidebar never creates one just to display a
 * teammate), so the very first send has to find-or-create it. Race-safe via
 * `dmPairKey`'s unique constraint — if two concurrent first-messages both
 * try to create the same pair, the loser's insert fails with P2002 and it
 * simply re-reads the winner's row instead of erroring or duplicating.
 */
async function resolveConversation(
	user: AuthenticatedUser,
	target: MessageTarget,
): Promise<{ conversationId: string; participantIds: string[]; isNewConversation: boolean }> {
	if ("conversationId" in target) {
		const { conversation } = await requireParticipant(target.conversationId, user.id);
		return {
			conversationId: conversation.id,
			participantIds: conversation.participants.map((p) => p.userId),
			isNewConversation: false,
		};
	}

	const recipientId = target.recipientUserId;
	if (recipientId === user.id) throw AppError.badRequest("You can't message yourself");

	const recipient = await prisma.user.findUnique({
		where: { id: recipientId },
		select: { id: true, status: true },
	});
	if (!recipient || recipient.status !== "active") throw AppError.notFound("That teammate wasn't found");

	const pairKey = [user.id, recipientId].sort().join(":");

	const existing = await prisma.internalConversation.findUnique({ where: { dmPairKey: pairKey } });
	if (existing)
		return { conversationId: existing.id, participantIds: [user.id, recipientId], isNewConversation: false };

	try {
		const created = await prisma.internalConversation.create({
			data: {
				type: "dm",
				createdById: user.id,
				dmPairKey: pairKey,
				participants: { create: [{ userId: user.id }, { userId: recipientId }] },
			},
		});
		return { conversationId: created.id, participantIds: [user.id, recipientId], isNewConversation: true };
	} catch (err) {
		if (!isUniqueViolationOn(err, "internal_conversations_dm_pair_key_key")) throw err;
		// Lost the race — someone else's concurrent first-message created this
		// pair's conversation a moment ago. Use their row; this send becomes
		// message #2, not a duplicate thread.
		const winner = await prisma.internalConversation.findUniqueOrThrow({ where: { dmPairKey: pairKey } });
		return { conversationId: winner.id, participantIds: [user.id, recipientId], isNewConversation: false };
	}
}

export const internalMessagingService = {
	/**
	 * Dual realtime transport: every push below fires over BOTH the native
	 * WebSocket (lib/realtime.ts — free, no setup, but can't stay open on a
	 * classic serverless deploy like this app's Vercel backend) AND Pusher
	 * (lib/pusher.ts — needs a free-tier account, but works everywhere,
	 * including serverless). `pusherEnabled` lets the frontend know whether
	 * it's worth even trying that second connection; attachmentsEnabled is
	 * Cloudinary, unrelated to either.
	 */
	async getStatus() {
		return ServiceResponse.success("Link Internal Board status retrieved.", {
			attachmentsEnabled: isCloudinaryConfigured,
			realtimeEnabled: true,
			pusherEnabled: Boolean(getPusherKey()),
		});
	},

	/**
	 * Phase 2 — the auto-synced sidebar. Every active VA/Admin except the
	 * caller, each merged with their DM's status if one exists (null if not —
	 * the sidebar shows them regardless, per phase-2.md's "do not create
	 * empty conversation records just to show users").
	 *
	 * Batched: one query for the roster, one for the caller's conversations,
	 * one for unread-eligible messages across all of them — never "per user,
	 * query their conversation" (would be an N+1 against a growing team).
	 */
	async getRoster(user: AuthenticatedUser) {
		const [teammates, conversations] = await Promise.all([
			prisma.user.findMany({
				where: { id: { not: user.id }, status: "active" },
				select: SENDER_SELECT,
				orderBy: { name: "asc" },
			}),
			prisma.internalConversation.findMany({
				where: { type: "dm", participants: { some: { userId: user.id } } },
				include: { participants: { select: { userId: true, lastReadAt: true } } },
			}),
		]);

		const conversationIds = conversations.map((c) => c.id);
		const unreadCandidates = conversationIds.length
			? await prisma.internalMessage.findMany({
					where: { conversationId: { in: conversationIds }, senderId: { not: user.id }, deletedAt: null },
					select: { conversationId: true, createdAt: true },
				})
			: [];

		const lastReadAtByConversationId = new Map<string, Date | null>();
		const conversationByOtherUserId = new Map<string, (typeof conversations)[number]>();
		for (const c of conversations) {
			const me = c.participants.find((p) => p.userId === user.id);
			lastReadAtByConversationId.set(c.id, me?.lastReadAt ?? null);
			const other = c.participants.find((p) => p.userId !== user.id);
			if (other) conversationByOtherUserId.set(other.userId, c);
		}

		const unreadCountByConversationId = new Map<string, number>();
		for (const m of unreadCandidates) {
			const lastReadAt = lastReadAtByConversationId.get(m.conversationId) ?? null;
			if (lastReadAt && m.createdAt <= lastReadAt) continue;
			unreadCountByConversationId.set(m.conversationId, (unreadCountByConversationId.get(m.conversationId) ?? 0) + 1);
		}

		const items = teammates.map((teammate) => {
			const conversation = conversationByOtherUserId.get(teammate.id);
			return {
				user: teammate,
				conversation: conversation
					? {
							id: conversation.id,
							lastMessageAt: conversation.lastMessageAt,
							lastMessagePreview: conversation.lastMessagePreview,
							unreadCount: unreadCountByConversationId.get(conversation.id) ?? 0,
						}
					: null,
			};
		});

		// Most recent activity first; teammates with no conversation yet sort
		// alphabetically at the end, same as WhatsApp/Slack's "new contact"
		// section below active chats.
		items.sort((a, b) => {
			const at = a.conversation?.lastMessageAt?.getTime() ?? 0;
			const bt = b.conversation?.lastMessageAt?.getTime() ?? 0;
			if (at !== bt) return bt - at;
			return a.user.name.localeCompare(b.user.name);
		});

		return ServiceResponse.success("Roster retrieved.", { items });
	},

	async getMessages(conversationId: string, user: AuthenticatedUser, rawQuery: Record<string, unknown>) {
		await requireParticipant(conversationId, user.id);

		// validateRequest only re-applies zod's parsed/coerced output to
		// req.body (Express 5 makes req.query a read-only getter — see
		// httpHandlers.ts) — so page/limit still arrive here as raw query
		// strings despite the route's schema declaring them as numbers. Same
		// manual coercion messaging.service.ts's getMessages uses for the
		// identical reason.
		const page = Math.max(1, Number(rawQuery.page) || 1);
		const limit = Math.min(200, Math.max(1, Number(rawQuery.limit) || 50));
		const [total, rows] = await Promise.all([
			prisma.internalMessage.count({ where: { conversationId, deletedAt: null } }),
			prisma.internalMessage.findMany({
				where: { conversationId, deletedAt: null },
				include: MESSAGE_INCLUDE,
				// Newest page first (skip/take from the end), then re-sorted
				// ascending for display — same "latest N, oldest first on screen"
				// shape as the SMS thread's getMessages.
				orderBy: { createdAt: "desc" },
				skip: (page - 1) * limit,
				take: limit,
			}),
		]);

		return ServiceResponse.success("Messages retrieved.", {
			messages: rows.reverse().map(messageDto),
			total,
			page,
			limit,
		});
	},

	/**
	 * Sends into an existing conversation OR, for a teammate the caller has
	 * never messaged, lazily creates the DM first — see resolveConversation.
	 * Either way the response carries the resolved `conversation.id` so a
	 * client that started from "no conversation yet" learns the real id to
	 * use for every message after this one.
	 */
	async sendMessage(
		user: AuthenticatedUser,
		target: MessageTarget,
		input: { body?: string; attachments?: Array<Record<string, unknown>>; replyToId?: string },
	) {
		const { conversationId, participantIds, isNewConversation } = await resolveConversation(user, target);

		if (input.replyToId) {
			const original = await prisma.internalMessage.findUnique({
				where: { id: input.replyToId },
				select: { conversationId: true, deletedAt: true },
			});
			if (!original || original.conversationId !== conversationId || original.deletedAt) {
				throw AppError.badRequest("Can't reply to that message");
			}
		}

		const message = await prisma.$transaction(async (tx) => {
			const created = await tx.internalMessage.create({
				data: {
					conversationId,
					senderId: user.id,
					body: input.body?.trim() || null,
					replyToId: input.replyToId ?? null,
					attachments: input.attachments?.length
						? {
								create: input.attachments.map((a) => ({
									type: a.type as "image" | "video" | "audio" | "file",
									url: a.url as string,
									thumbnailUrl: (a.thumbnailUrl as string | null) ?? null,
									fileName: a.fileName as string,
									mimeType: a.mimeType as string,
									sizeBytes: a.sizeBytes as number,
									width: (a.width as number | null) ?? null,
									height: (a.height as number | null) ?? null,
									durationSeconds: (a.durationSeconds as number | null) ?? null,
								})),
							}
						: undefined,
				},
				include: MESSAGE_INCLUDE,
			});

			const preview = created.body?.trim()
				? created.body.trim().slice(0, 140)
				: created.attachments.length > 0
					? `📎 ${created.attachments.length > 1 ? `${created.attachments.length} attachments` : created.attachments[0].fileName}`
					: "";

			await tx.internalConversation.update({
				where: { id: conversationId },
				data: { lastMessageAt: created.createdAt, lastMessagePreview: preview },
			});

			// The sender has implicitly "read" their own message — keeps their own
			// unread count from ticking up when useMarkConversationRead hasn't
			// fired yet (e.g. a fast second message before the mark-read request
			// lands).
			await tx.internalConversationParticipant.update({
				where: { conversationId_userId: { conversationId, userId: user.id } },
				data: { lastReadAt: created.createdAt },
			});

			return { created, preview };
		});

		// Dual transport — see getStatus()'s doc comment. Both no-op safely
		// (Pusher when unconfigured; WS when nobody's connected), so firing
		// both unconditionally is always safe, never redundant-error-prone.
		broadcastToUsers(participantIds, {
			type: "internal.new-message",
			conversationId,
			messageId: message.created.id,
			senderId: user.id,
			preview: message.preview,
			createdAt: message.created.createdAt.toISOString(),
		});
		broadcastToUsers(participantIds, { type: "internal.conversation-updated", conversationId });
		notifyInternalNewMessage(participantIds, {
			conversationId,
			messageId: message.created.id,
			senderId: user.id,
			preview: message.preview,
			createdAt: message.created.createdAt.toISOString(),
		});
		notifyInternalConversationUpdated(participantIds, conversationId);

		return ServiceResponse.success(
			"Message sent.",
			{
				message: messageDto(message.created),
				conversation: { id: conversationId, isNew: isNewConversation },
			},
			201,
		);
	},

	async markRead(conversationId: string, user: AuthenticatedUser) {
		await requireParticipant(conversationId, user.id);

		await prisma.internalConversationParticipant.update({
			where: { conversationId_userId: { conversationId, userId: user.id } },
			data: { lastReadAt: new Date() },
		});

		return ServiceResponse.success("Conversation marked read.", { conversationId });
	},

	/**
	 * Typing indicator — fire-and-forget, no DB write, no history. Works even
	 * before a conversation exists (a brand-new chat): the `recipientUserId`
	 * branch pushes straight to that person regardless of any conversation
	 * row, same as sendMessage's lazy path.
	 */
	async notifyTyping(user: AuthenticatedUser, target: MessageTarget) {
		let recipientIds: string[];
		if ("conversationId" in target) {
			const { conversation } = await requireParticipant(target.conversationId, user.id);
			recipientIds = conversation.participants.map((p) => p.userId).filter((id) => id !== user.id);
		} else {
			recipientIds = [target.recipientUserId];
		}
		for (const id of recipientIds) {
			broadcastToUser(id, { type: "internal.typing", fromUserId: user.id, fromName: user.name });
			notifyInternalTyping(id, { id: user.id, name: user.name });
		}
		return ServiceResponse.success("ok", null);
	},

	/**
	 * Uploads one file to Cloudinary and returns its metadata WITHOUT creating
	 * any DB row — the composer calls this per-file as soon as it's picked
	 * (so the progress bar/preview can resolve immediately), then hands the
	 * returned metadata back verbatim on the actual POST .../messages send.
	 * An upload that's never attached to a sent message just sits unreferenced
	 * on Cloudinary — the same trade-off the avatar upload makes, and cheap
	 * enough at this scale not to need a cleanup job for Phase 1.
	 */
	async uploadAttachment(file: Express.Multer.File) {
		if (!isCloudinaryConfigured) {
			throw AppError.badRequest(
				"File attachments aren't configured on this server yet. An admin needs to set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.",
			);
		}

		const attachmentType: "image" | "video" | "audio" | "file" = file.mimetype.startsWith("image/")
			? "image"
			: file.mimetype.startsWith("video/")
				? "video"
				: file.mimetype.startsWith("audio/")
					? "audio"
					: "file";
		// Cloudinary has no native "audio" resource type — audio uploads go
		// through "video" (it handles audio-only containers fine) so duration
		// still comes back; anything else non-image goes through "raw".
		const cloudinaryResourceType: "image" | "video" | "raw" =
			attachmentType === "image" ? "image" : attachmentType === "video" || attachmentType === "audio" ? "video" : "raw";

		const uploaded = await uploadInternalMessageAttachment(file.buffer, file.originalname, cloudinaryResourceType);

		return ServiceResponse.success("File uploaded.", {
			type: attachmentType,
			url: uploaded.url,
			thumbnailUrl: uploaded.thumbnailUrl,
			fileName: file.originalname,
			mimeType: file.mimetype,
			sizeBytes: file.size,
			width: uploaded.width,
			height: uploaded.height,
			durationSeconds: uploaded.durationSeconds,
		});
	},
};
