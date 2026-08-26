import { StatusCodes } from "http-status-codes";

import { isCloudinaryConfigured, uploadInternalMessageAttachment } from "@/lib/cloudinary";
import { getPusherKey, notifyInternalConversationUpdated, notifyInternalNewMessage } from "@/lib/pusher";
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

const MESSAGE_INCLUDE = {
	sender: { select: SENDER_SELECT },
	attachments: { select: ATTACHMENT_SELECT },
} as const;

function messageDto(message: {
	id: string;
	conversationId: string;
	senderId: string;
	sender: { id: string; name: string; role: string; avatar: string | null };
	body: string | null;
	editedAt: Date | null;
	deletedAt: Date | null;
	createdAt: Date;
	attachments: Array<Record<string, unknown>>;
}) {
	return {
		id: message.id,
		conversationId: message.conversationId,
		senderId: message.senderId,
		sender: message.sender,
		body: message.body,
		attachments: message.attachments,
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

export const internalMessagingService = {
	/** Whether attachments (Cloudinary) and real-time push (Pusher) are live —
	 *  the UI degrades gracefully (text-only, polling-only) when either is
	 *  unset, same convention as the SMS messaging module's getStatus(). */
	async getStatus() {
		return ServiceResponse.success("Link Internal Board status retrieved.", {
			attachmentsEnabled: isCloudinaryConfigured,
			realtimeEnabled: Boolean(getPusherKey()),
		});
	},

	/**
	 * Every DM the caller is part of, newest activity first. Unread count is
	 * "messages from the other person after my lastReadAt" — cheap enough to
	 * compute per-row for a staff-sized roster (a handful of VAs/Admins, not
	 * thousands of threads).
	 */
	async listConversations(user: AuthenticatedUser) {
		const conversations = await prisma.internalConversation.findMany({
			where: { participants: { some: { userId: user.id } } },
			include: {
				participants: {
					include: { user: { select: SENDER_SELECT } },
				},
			},
			orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
		});

		const dtos = await Promise.all(
			conversations.map(async (c) => {
				const me = c.participants.find((p) => p.userId === user.id);
				const others = c.participants.filter((p) => p.userId !== user.id).map((p) => p.user);
				const unreadCount = await prisma.internalMessage.count({
					where: {
						conversationId: c.id,
						senderId: { not: user.id },
						deletedAt: null,
						...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
					},
				});
				return {
					id: c.id,
					type: c.type,
					name: c.name,
					avatarUrl: c.avatarUrl,
					// DM display identity is the other participant — Phase 2 groups
					// will use `name`/`avatarUrl` instead once `type === "group"`.
					otherParticipants: others,
					lastMessageAt: c.lastMessageAt,
					lastMessagePreview: c.lastMessagePreview,
					unreadCount,
					createdAt: c.createdAt,
					updatedAt: c.updatedAt,
				};
			}),
		);

		return ServiceResponse.success("Conversations retrieved.", { conversations: dtos });
	},

	/**
	 * Finds the existing DM with `otherUserId`, or creates one. Idempotent by
	 * design — clicking a teammate in the "new message" picker always lands on
	 * the same thread rather than spawning duplicates.
	 */
	async startConversation(user: AuthenticatedUser, otherUserId: string) {
		if (otherUserId === user.id) throw AppError.badRequest("You can't start a conversation with yourself");

		const other = await prisma.user.findUnique({ where: { id: otherUserId }, select: SENDER_SELECT });
		if (!other) throw AppError.notFound("That teammate wasn't found");

		const existing = await prisma.internalConversation.findFirst({
			where: {
				type: "dm",
				AND: [{ participants: { some: { userId: user.id } } }, { participants: { some: { userId: otherUserId } } }],
			},
			include: { participants: { include: { user: { select: SENDER_SELECT } } } },
		});

		const conversation =
			existing ??
			(await prisma.internalConversation.create({
				data: {
					type: "dm",
					createdById: user.id,
					participants: {
						create: [{ userId: user.id }, { userId: otherUserId }],
					},
				},
				include: { participants: { include: { user: { select: SENDER_SELECT } } } },
			}));

		return ServiceResponse.success(
			existing ? "Conversation found." : "Conversation started.",
			{
				conversation: {
					id: conversation.id,
					type: conversation.type,
					name: conversation.name,
					avatarUrl: conversation.avatarUrl,
					otherParticipants: conversation.participants.filter((p) => p.userId !== user.id).map((p) => p.user),
					lastMessageAt: conversation.lastMessageAt,
					lastMessagePreview: conversation.lastMessagePreview,
					unreadCount: 0,
					createdAt: conversation.createdAt,
					updatedAt: conversation.updatedAt,
				},
			},
			existing ? StatusCodes.OK : StatusCodes.CREATED,
		);
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

	async sendMessage(
		conversationId: string,
		user: AuthenticatedUser,
		input: { body?: string; attachments?: Array<Record<string, unknown>> },
	) {
		await requireParticipant(conversationId, user.id);

		const message = await prisma.$transaction(async (tx) => {
			const created = await tx.internalMessage.create({
				data: {
					conversationId,
					senderId: user.id,
					body: input.body?.trim() || null,
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

			return created;
		});

		const participantIds = (
			await prisma.internalConversationParticipant.findMany({
				where: { conversationId },
				select: { userId: true },
			})
		).map((p) => p.userId);
		notifyInternalNewMessage(participantIds, conversationId, message.id);
		notifyInternalConversationUpdated(participantIds, conversationId);

		return ServiceResponse.success("Message sent.", { message: messageDto(message) }, StatusCodes.CREATED);
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
