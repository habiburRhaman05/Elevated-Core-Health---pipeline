import { StatusCodes } from "http-status-codes";

import { audit, type RequestContext } from "@/lib/audit";
import { normalizeE164 } from "@/lib/phone";
import { isQuoConfigured, QuoApiError, sendMessage as quoSendMessage } from "@/lib/quo";
import type { AuthenticatedUser } from "@/lib/types";
import { env } from "@/utils/envConfig";
import { logger } from "@/utils/logger";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";

const noContext: RequestContext = { ip: null, userAgent: null };

/**
 * Same idea as auth.service.ts's isCloudinaryConfigured check — every route
 * that would actually talk to Quo fails clearly and immediately instead of
 * silently doing nothing (or crashing) when the env vars aren't set yet.
 */
const NOT_CONFIGURED_MESSAGE =
	"SMS messaging isn't configured on this server yet. An admin needs to set QUO_API_KEY, QUO_FROM_NUMBER, and QUO_USER_ID.";

interface ConversationWithPatient {
	id: string;
	phoneNumber: string;
	patientId: string | null;
	quoContactId: string | null;
	lastMessageAt: Date | null;
	lastMessagePreview: string | null;
	unreadCount: number;
	createdAt: Date;
	updatedAt: Date;
	patient?: { id: string; firstName: string; lastName: string | null } | null;
}

function patientLabel(conversation: Pick<ConversationWithPatient, "patient" | "phoneNumber">): string {
	if (!conversation.patient) return conversation.phoneNumber;
	return `${conversation.patient.firstName} ${conversation.patient.lastName ?? ""}`.trim();
}

function conversationDto(conversation: ConversationWithPatient) {
	return {
		id: conversation.id,
		phoneNumber: conversation.phoneNumber,
		patientId: conversation.patientId,
		patient: conversation.patient
			? {
					id: conversation.patient.id,
					name: [conversation.patient.firstName, conversation.patient.lastName].filter(Boolean).join(" ").trim(),
				}
			: null,
		lastMessageAt: conversation.lastMessageAt,
		lastMessagePreview: conversation.lastMessagePreview,
		unreadCount: conversation.unreadCount,
		createdAt: conversation.createdAt,
		updatedAt: conversation.updatedAt,
	};
}

const PATIENT_SELECT = { id: true, firstName: true, lastName: true } as const;

class MessagingService {
	/**
	 * Lets the frontend show the "SMS isn't configured yet" fallback
	 * proactively (banner on the inbox / modal tab) instead of only after a
	 * VA already tried to send and got a failure back.
	 */
	getStatus() {
		const configured = isQuoConfigured && Boolean(env.QUO_FROM_NUMBER) && Boolean(env.QUO_USER_ID);
		return ServiceResponse.success("Messaging status retrieved.", { configured });
	}

	/** Paginated, ordered by most recent activity — the central inbox list. */
	async listConversations(rawQuery: Record<string, unknown>) {
		const page = Math.max(1, Number(rawQuery.page) || 1);
		const limit = Math.min(100, Math.max(1, Number(rawQuery.limit) || 50));
		const search = typeof rawQuery.search === "string" ? rawQuery.search.trim() : "";
		const unmatchedOnly = rawQuery.unmatchedOnly === true || rawQuery.unmatchedOnly === "true";

		const where: Record<string, unknown> = {};
		if (unmatchedOnly) where.patientId = null;
		if (search) {
			where.OR = [
				{ phoneNumber: { contains: search } },
				{ patient: { firstName: { contains: search, mode: "insensitive" } } },
				{ patient: { lastName: { contains: search, mode: "insensitive" } } },
			];
		}

		const [rows, total] = await Promise.all([
			prisma.smsConversation.findMany({
				where,
				orderBy: { lastMessageAt: "desc" },
				skip: (page - 1) * limit,
				take: limit,
				include: { patient: { select: PATIENT_SELECT } },
			}),
			prisma.smsConversation.count({ where }),
		]);

		return ServiceResponse.success("Conversations retrieved.", {
			conversations: rows.map((r) => conversationDto(r)),
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		});
	}

	/**
	 * Used by the patient modal's Messages tab. If no conversation row exists
	 * yet for this patient's phone number, one is created here (empty of
	 * messages) rather than returning a 404 — a VA can send the first message
	 * to a patient before any inbound message has ever arrived. Also links an
	 * existing "unmatched" conversation to this patient if one already exists
	 * for the same number (e.g. they texted in before this patient record had
	 * a phone number on file).
	 */
	async getConversationByPatientId(patientId: string) {
		const patient = await prisma.patient.findUnique({
			where: { id: patientId },
			select: { id: true, phone: true, firstName: true, lastName: true },
		});
		if (!patient) return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);

		const normalizedPhone = normalizeE164(patient.phone);
		if (!normalizedPhone) {
			return ServiceResponse.success("This patient has no phone number on file.", { conversation: null });
		}

		let conversation = await prisma.smsConversation.findUnique({
			where: { phoneNumber: normalizedPhone },
			include: { patient: { select: PATIENT_SELECT } },
		});

		if (!conversation) {
			conversation = await prisma.smsConversation.create({
				data: { phoneNumber: normalizedPhone, patientId },
				include: { patient: { select: PATIENT_SELECT } },
			});
		} else if (!conversation.patientId) {
			conversation = await prisma.smsConversation.update({
				where: { id: conversation.id },
				data: { patientId },
				include: { patient: { select: PATIENT_SELECT } },
			});
		}

		return ServiceResponse.success("Conversation ready.", { conversation: conversationDto(conversation) });
	}

	/** Thread fetch, chronological (oldest first, like a normal chat thread). */
	async getMessages(conversationId: string, rawQuery: Record<string, unknown>) {
		const conversation = await prisma.smsConversation.findUnique({ where: { id: conversationId } });
		if (!conversation) return ServiceResponse.failure("Conversation not found.", null, StatusCodes.NOT_FOUND);

		const page = Math.max(1, Number(rawQuery.page) || 1);
		const limit = Math.min(200, Math.max(1, Number(rawQuery.limit) || 50));

		const [messages, total] = await Promise.all([
			prisma.smsMessage.findMany({
				where: { conversationId },
				orderBy: { createdAt: "asc" },
				skip: (page - 1) * limit,
				take: limit,
				// sentByUser included so every outbound bubble can show WHO sent
				// it (name), not just "sent" — multiple VAs share this inbox.
				include: { sentByUser: { select: { id: true, name: true } } },
			}),
			prisma.smsMessage.count({ where: { conversationId } }),
		]);

		return ServiceResponse.success("Messages retrieved.", { messages, total, page, limit });
	}

	/**
	 * Sends an outbound SMS via Quo. Never fails silently: if Quo isn't
	 * configured, or the send call itself fails, the message row is still
	 * written with status "failed" + errorMessage, and a clear failure
	 * response is returned — the VA sees a failure state, not a no-op.
	 */
	async sendMessage(
		conversationId: string,
		content: string,
		actor: AuthenticatedUser,
		ctx: RequestContext = noContext,
	) {
		const conversation = await prisma.smsConversation.findUnique({
			where: { id: conversationId },
			include: { patient: { select: PATIENT_SELECT } },
		});
		if (!conversation) return ServiceResponse.failure("Conversation not found.", null, StatusCodes.NOT_FOUND);

		const label = patientLabel(conversation);

		const fromNumber = env.QUO_FROM_NUMBER;
		const quoUserId = env.QUO_USER_ID;
		if (!isQuoConfigured || !fromNumber || !quoUserId) {
			logger.warn({ conversationId }, "Attempted to send SMS but Quo isn't configured");
			return ServiceResponse.failure(NOT_CONFIGURED_MESSAGE, null, StatusCodes.SERVICE_UNAVAILABLE);
		}

		let quoMessageId: string | null = null;
		let status: "sent" | "failed" = "sent";
		let errorMessage: string | null = null;

		try {
			const result = await quoSendMessage({
				to: conversation.phoneNumber,
				from: fromNumber,
				userId: quoUserId,
				content,
			});
			quoMessageId = result.id || null;
		} catch (err) {
			status = "failed";
			errorMessage = err instanceof QuoApiError ? err.message : "Failed to send message via Quo.";
			logger.error({ err, conversationId }, "Quo sendMessage failed");
		}

		const message = await prisma.smsMessage.create({
			data: {
				conversationId,
				direction: "outbound",
				body: content,
				status,
				quoMessageId,
				sentById: actor.id,
				errorMessage,
			},
			include: { sentByUser: { select: { id: true, name: true } } },
		});

		// Only advance the inbox preview on an actually-sent message — a failed
		// send shouldn't make the conversation list look like the clinic replied.
		if (status === "sent") {
			await prisma.smsConversation.update({
				where: { id: conversationId },
				data: { lastMessageAt: message.createdAt, lastMessagePreview: content.slice(0, 200) },
			});
		}

		// Hard requirement (Phase 3.5) — every SMS event must be traceable to
		// who did what, to which patient, and when, same as stage moves/flags/notes.
		await audit({
			user: actor,
			patientId: conversation.patientId ?? null,
			action: "sms.sent",
			category: "messaging",
			entityType: "sms_message",
			entityId: message.id,
			message:
				status === "sent"
					? `${actor.name} sent an SMS to ${label}`
					: `${actor.name} tried to send an SMS to ${label} — it failed (${errorMessage})`,
			metadata: { conversationId, phoneNumber: conversation.phoneNumber, status },
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});

		if (status === "failed") {
			return ServiceResponse.failure(errorMessage || "Failed to send message.", { message }, StatusCodes.BAD_GATEWAY);
		}
		return ServiceResponse.success("Message sent.", { message });
	}

	/** Resets unreadCount to 0 when a VA opens a thread. */
	async markConversationRead(conversationId: string, _actor: AuthenticatedUser) {
		try {
			const conversation = await prisma.smsConversation.update({
				where: { id: conversationId },
				data: { unreadCount: 0 },
				include: { patient: { select: PATIENT_SELECT } },
			});
			return ServiceResponse.success("Marked as read.", { conversation: conversationDto(conversation) });
		} catch {
			return ServiceResponse.failure("Conversation not found.", null, StatusCodes.NOT_FOUND);
		}
	}
}

export const messagingService = new MessagingService();
