import { StatusCodes } from "http-status-codes";

import { audit, type RequestContext } from "@/lib/audit";
import { normalizeE164 } from "@/lib/phone";
import { notifyConversationUpdated, notifyNewMessage } from "@/lib/pusher";
import {
	getMessagingCapableNumbers,
	getWorkspaceNumbers,
	isQuoConfigured,
	listCalls,
	listQuoConversations,
	listQuoMessages,
	type MessagingCapableNumber,
	QuoApiError,
	sendMessage as quoSendMessage,
} from "@/lib/quo";
import type { AuthenticatedUser } from "@/lib/types";
import { logger } from "@/utils/logger";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";

const noContext: RequestContext = { ip: null, userAgent: null };

/**
 * Same idea as auth.service.ts's isCloudinaryConfigured check — every route
 * that would actually talk to Quo fails clearly and immediately instead of
 * silently doing nothing (or crashing) when it isn't set up yet.
 */
const NOT_CONFIGURED_MESSAGE =
	"SMS messaging isn't configured on this server yet. An admin needs to set QUO_API_KEY and have at least one US-messaging-enabled number on the Quo workspace.";

const NO_NUMBER_MESSAGE =
	"No Quo business number was selected for this message, and the workspace has more than one to choose from.";

interface ConversationWithPatient {
	id: string;
	phoneNumber: string;
	patientId: string | null;
	quoContactId: string | null;
	quoContactName: string | null;
	quoPhoneNumberId: string | null;
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
}function conversationDto(conversation: ConversationWithPatient) {
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
			quoPhoneNumberId: conversation.quoPhoneNumberId,
			quoContactName: conversation.quoContactName,
			lastMessageAt: conversation.lastMessageAt,
			lastMessagePreview: conversation.lastMessagePreview,
			unreadCount: conversation.unreadCount,
			createdAt: conversation.createdAt,
			updatedAt: conversation.updatedAt,
	};
}

const PATIENT_SELECT = { id: true, firstName: true, lastName: true } as const;

/**
 * Pulls conversations and messages from Quo's API and upserts them into the
 * local DB. This ensures the dashboard shows existing Quo data even if no
 * webhooks have fired yet. Sync is idempotent — running it multiple times
 * won't create duplicates (upserts by quoMessageId / phoneNumber).
 */
/**
 * Last time syncFromQuo ran — prevents hammering the Quo API on every
 * request. Cooldown: 60 seconds.
 */
let lastSyncAt = 0;
const SYNC_COOLDOWN_MS = 60_000;

/**
 * Pulls conversation metadata from Quo's API and upserts them into the
 * local DB. This is FAST — it only fetches conversation list (no messages).
 * Message sync happens per-thread when getMessages is called.
 *
 * Designed to be fire-and-forget (never awaited on the hot path).
 * Errors are logged but never block the user.
 */
async function syncConversationsFromQuo(): Promise<void> {
	if (!isQuoConfigured) return;

	const now = Date.now();
	if (now - lastSyncAt < SYNC_COOLDOWN_MS) return;
	lastSyncAt = now;

	try {
		// One pass per business number - including restricted ones, so a
		// restricted inbox still shows its real history when viewed (it just
		// can't be sent from). Each synced thread is stamped with the number
		// it actually belongs to instead of all landing on one.
		const numbers = await getWorkspaceNumbers();
		for (const number of numbers) {
			if (!number.userId) continue;
			const quoConversations = await listQuoConversations(number.userId);
			logger.info({ count: quoConversations.length, phoneNumberId: number.phoneNumberId }, "Synced Quo conversations");

			for (const quoConv of quoConversations) {
				const participants = quoConv.participants ?? [];
				if (participants.length === 0) continue;

				const patientPhone = participants.find((p) => p !== number.phoneNumber) ?? participants[0];

				const existing = await prisma.smsConversation.findUnique({
					where: { phoneNumber: patientPhone },
				});

				if (!existing) {
					await prisma.smsConversation.create({
						data: {
							phoneNumber: patientPhone,
							quoPhoneNumberId: quoConv.phoneNumberId ?? number.phoneNumberId,
							lastMessageAt: quoConv.lastActivityAt ? new Date(quoConv.lastActivityAt) : new Date(),
							lastMessagePreview: quoConv.name ?? null,
						},
					});
					continue;
				}

				const quoActivity = quoConv.lastActivityAt ? new Date(quoConv.lastActivityAt) : null;
				const bumpActivity = quoActivity && (!existing.lastMessageAt || quoActivity > existing.lastMessageAt);
				// Backfill the owning number onto pre-multi-number rows, but never
				// re-point a thread that already has one.
				const backfillNumber = !existing.quoPhoneNumberId;

				if (bumpActivity || backfillNumber) {
					await prisma.smsConversation.update({
						where: { id: existing.id },
						data: {
							...(bumpActivity ? { lastMessageAt: quoActivity as Date } : {}),
							...(backfillNumber ? { quoPhoneNumberId: quoConv.phoneNumberId ?? number.phoneNumberId } : {}),
						},
					});
				}
			}
		}
	} catch (err) {
		logger.error({ err }, "Failed to sync conversations from Quo — falling back to local data");
	}
}

/**
 * Syncs messages for a SINGLE conversation from Quo into the local DB.
 * Called on-demand when a user opens a specific thread (getMessages).
 */
async function syncMessagesForConversation(
	conversationId: string,
	patientPhone: string,
	quoPhoneNumberId: string | null,
): Promise<void> {
	if (!isQuoConfigured) return;

	// Legacy threads (created before multi-number support) have no owning
	// number recorded; fall back to the workspace's sole number when there is
	// exactly one, otherwise there is nothing safe to guess.
	let phoneNumberId = quoPhoneNumberId;
	if (!phoneNumberId) {
		const numbers = await getWorkspaceNumbers();
		if (numbers.length !== 1) return;
		phoneNumberId = numbers[0].phoneNumberId;
	}

	try {
		const quoMessages = await listQuoMessages({
			phoneNumberId,
			participants: [patientPhone],
		});

		for (const quoMsg of quoMessages) {
			const quoMedia = quoMsg.media && quoMsg.media.length > 0 ? quoMsg.media : null;
			const existing = quoMsg.id ? await prisma.smsMessage.findUnique({ where: { quoMessageId: quoMsg.id } }) : null;

			if (existing) {
				// Backfill media onto rows that were synced BEFORE the media
				// column existed. Without this the `continue` below would skip
				// them forever, so every already-synced message would show up
				// with its attachments permanently missing.
				if (quoMedia && existing.media === null) {
					await prisma.smsMessage.update({
						where: { id: existing.id },
						data: { media: JSON.parse(JSON.stringify(quoMedia)) },
					});
				}
				continue;
			}

			await prisma.smsMessage.create({
				data: {
					conversationId,
					direction: quoMsg.direction === "outgoing" ? "outbound" : "inbound",
					body: quoMsg.text ?? "",
					status: quoMsg.status ?? "received",
					quoMessageId: quoMsg.id,
					createdAt: quoMsg.createdAt ? new Date(quoMsg.createdAt) : undefined,
					media: quoMedia ? JSON.parse(JSON.stringify(quoMedia)) : undefined,
				},
			});
		}
	} catch (err) {
		logger.warn({ err, conversationId }, "Failed to sync messages for conversation from Quo");
	}
}

/**
 * Syncs call history for a SINGLE conversation from Quo into the local DB -
 * same on-demand, fire-and-forget pattern as syncMessagesForConversation.
 * A call with no usable participant number (Quo returns this occasionally -
 * seen live, `participants: []`) is skipped: there's nothing to attribute it
 * to, and guessing would risk showing it under the wrong patient's thread.
 */
async function syncCallsForConversation(
	conversationId: string,
	patientPhone: string,
	quoPhoneNumberId: string | null,
): Promise<void> {
	if (!isQuoConfigured) return;

	let phoneNumberId = quoPhoneNumberId;
	if (!phoneNumberId) {
		const numbers = await getWorkspaceNumbers();
		if (numbers.length !== 1) return;
		phoneNumberId = numbers[0].phoneNumberId;
	}

	try {
		const quoCalls = await listCalls({ phoneNumberId, participants: [patientPhone] });

		for (const quoCall of quoCalls) {
			if (!quoCall.id || (quoCall.participants ?? []).length === 0) continue;
			const existing = await prisma.smsCallLog.findUnique({ where: { quoCallId: quoCall.id } });
			if (existing) continue;

			await prisma.smsCallLog.create({
				data: {
					conversationId,
					quoCallId: quoCall.id,
					direction: quoCall.direction,
					status: quoCall.status,
					durationSeconds: typeof quoCall.duration === "number" ? quoCall.duration : null,
					createdAt: quoCall.createdAt ? new Date(quoCall.createdAt) : new Date(),
				},
			});
		}
	} catch (err) {
		logger.warn({ err, conversationId }, "Failed to sync calls for conversation from Quo");
	}
}

class MessagingService {
	/**
	 * Lets the frontend show the "SMS isn't configured yet" fallback
	 * proactively (banner on the inbox / modal tab) instead of only after a
	 * VA already tried to send and got a failure back.
	 */
	async getStatus() {
		// "Configured" now means: we can reach Quo AND the workspace has at
		// least one number that is actually allowed to send US SMS.
		const numbers = isQuoConfigured ? await getMessagingCapableNumbers() : [];
		return ServiceResponse.success("Messaging status retrieved.", {
			configured: isQuoConfigured && numbers.length > 0,
			numberCount: numbers.length,
		});
	}

	/**
	 * Every business number on the workspace, for the Inboxes toggle - same
	 * as Quo's own dashboard, which lists every inbox regardless of whether
	 * it can send. Each entry carries `messagingCapable` so the client can
	 * show/disable sending accordingly; it is informational only. The actual
	 * send gate is enforced separately in sendMessage() against
	 * getMessagingCapableNumbers(), never against this list, so a restricted
	 * number showing up here can still never be used to send.
	 */
	async listNumbers() {
		if (!isQuoConfigured) {
			return ServiceResponse.success("Messaging is not configured.", { numbers: [] });
		}
		const numbers = await getWorkspaceNumbers();
		return ServiceResponse.success("Numbers retrieved.", {
			numbers: numbers.map((n) => ({
				id: n.id,
				phoneNumberId: n.phoneNumberId,
				formattedNumber: n.formattedNumber,
				userId: n.userId,
				messagingCapable: n.messagingCapable,
			})),
		});
	}

	/** Paginated, ordered by most recent activity — the central inbox list. */
	async listConversations(rawQuery: Record<string, unknown>) {
		// Fire-and-forget: sync conversation metadata from Quo in the background.
		// Never awaited — the response returns immediately with local data.
		syncConversationsFromQuo().catch(() => {});

		const page = Math.max(1, Number(rawQuery.page) || 1);
		const limit = Math.min(100, Math.max(1, Number(rawQuery.limit) || 50));
		const search = typeof rawQuery.search === "string" ? rawQuery.search.trim() : "";
		const unmatchedOnly = rawQuery.unmatchedOnly === true || rawQuery.unmatchedOnly === "true";
		const phoneNumberId = typeof rawQuery.phoneNumberId === "string" ? rawQuery.phoneNumberId.trim() : "";

		const where: Record<string, unknown> = {};
		if (unmatchedOnly) where.patientId = null;
		// Omitting phoneNumberId = the inbox's "All numbers" view, which is also
		// the only place pre-multi-number rows (quoPhoneNumberId: null) appear.
		// Filtering to a specific number is strict, so legacy rows don't get
		// duplicated under every number.
		if (phoneNumberId) where.quoPhoneNumberId = phoneNumberId;
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

		// On-demand sync: pull messages and calls for THIS conversation from Quo
		// before querying the local DB. Fire-and-forget if it fails.
		syncMessagesForConversation(conversationId, conversation.phoneNumber, conversation.quoPhoneNumberId).catch(
			() => {},
		);
		syncCallsForConversation(conversationId, conversation.phoneNumber, conversation.quoPhoneNumberId).catch(() => {});

		const page = Math.max(1, Number(rawQuery.page) || 1);
		const limit = Math.min(200, Math.max(1, Number(rawQuery.limit) || 50));

		const [messages, total, calls] = await Promise.all([
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
			// Calls aren't paginated separately - the thread is a merged,
			// chronological view and a conversation's call volume is small
			// relative to messages, so fetching them all is fine.
			prisma.smsCallLog.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } }),
		]);

		return ServiceResponse.success("Messages retrieved.", { messages, calls, total, page, limit });
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
		/** The number the VA has selected in the inbox toggle, if any. */
		selectedPhoneNumberId?: string,
	) {
		const conversation = await prisma.smsConversation.findUnique({
			where: { id: conversationId },
			include: { patient: { select: PATIENT_SELECT } },
		});
		if (!conversation) return ServiceResponse.failure("Conversation not found.", null, StatusCodes.NOT_FOUND);

		const label = patientLabel(conversation);

		if (!isQuoConfigured) {
			logger.warn({ conversationId }, "Attempted to send SMS but Quo isn't configured");
			return ServiceResponse.failure(NOT_CONFIGURED_MESSAGE, null, StatusCodes.SERVICE_UNAVAILABLE);
		}

		// Which business number does this go out on?
		//   1. the one this thread already belongs to (a reply must come from
		//      the number the patient has been texting),
		//   2. otherwise the one the VA picked in the inbox toggle,
		//   3. otherwise the only capable number, if there is exactly one.
		// Every candidate is resolved through getMessagingCapableNumbers(), so a
		// restricted number can't be used even if its id is passed by hand.
		const capableNumbers = await getMessagingCapableNumbers();
		if (capableNumbers.length === 0) {
			logger.warn({ conversationId }, "Attempted to send SMS but no messaging-capable Quo number is available");
			return ServiceResponse.failure(NOT_CONFIGURED_MESSAGE, null, StatusCodes.SERVICE_UNAVAILABLE);
		}

		const requestedId = conversation.quoPhoneNumberId ?? selectedPhoneNumberId ?? null;
		let sendFrom: MessagingCapableNumber | null = null;
		if (requestedId) {
			sendFrom = capableNumbers.find((n) => n.phoneNumberId === requestedId) ?? null;
			if (!sendFrom) {
				return ServiceResponse.failure(
					"That business number can't send SMS (it may be restricted or no longer on the workspace).",
					null,
					StatusCodes.BAD_REQUEST,
				);
			}
		} else if (capableNumbers.length === 1) {
			sendFrom = capableNumbers[0];
		}

		if (!sendFrom) {
			return ServiceResponse.failure(NO_NUMBER_MESSAGE, null, StatusCodes.BAD_REQUEST);
		}

		let quoMessageId: string | null = null;
		let status: "sent" | "failed" = "sent";
		let errorMessage: string | null = null;

		try {
			const result = await quoSendMessage({
				to: conversation.phoneNumber,
				from: sendFrom.phoneNumber,
				userId: sendFrom.userId,
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
				data: {
					lastMessageAt: message.createdAt,
					lastMessagePreview: content.slice(0, 200),
					// Stamp the owning number the first time we send on a thread
					// that didn't have one (a shell thread, or a legacy row).
					...(conversation.quoPhoneNumberId ? {} : { quoPhoneNumberId: sendFrom.phoneNumberId }),
				},
			});
		}

		// Real-time push — notify all connected clients about the new outbound
		// message. Same minimal payload as the inbound path: IDs only.
		notifyNewMessage(conversationId, message.id);
		notifyConversationUpdated(conversationId);

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
			metadata: {
				conversationId,
				phoneNumber: conversation.phoneNumber,
				status,
				fromNumber: sendFrom.formattedNumber,
				quoPhoneNumberId: sendFrom.phoneNumberId,
			},
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});

		if (status === "failed") {
			return ServiceResponse.failure(errorMessage || "Failed to send message.", { message }, StatusCodes.BAD_GATEWAY);
		}
		return ServiceResponse.success("Message sent.", { message });
	}

	/**
	 * Links an "unmatched" conversation to a patient, from the /messages
	 * contact panel. This only ever runs on an explicit VA/admin choice -
	 * inbound webhook matching never re-points an existing link on its own.
	 */
	async linkConversationToPatient(
		conversationId: string,
		patientId: string,
		actor: AuthenticatedUser,
		ctx: RequestContext = noContext,
	) {
		const [conversation, patient] = await Promise.all([
			prisma.smsConversation.findUnique({ where: { id: conversationId } }),
			prisma.patient.findUnique({ where: { id: patientId }, select: PATIENT_SELECT }),
		]);
		if (!conversation) return ServiceResponse.failure("Conversation not found.", null, StatusCodes.NOT_FOUND);
		if (!patient) return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);

		const updated = await prisma.smsConversation.update({
			where: { id: conversationId },
			data: { patientId },
			include: { patient: { select: PATIENT_SELECT } },
		});

		const label = `${patient.firstName} ${patient.lastName ?? ""}`.trim();
		await audit({
			user: actor,
			patientId,
			action: "sms.conversation_linked",
			category: "messaging",
			entityType: "sms_conversation",
			entityId: conversationId,
			prevValue: { patientId: conversation.patientId },
			newValue: { patientId },
			message: `${actor.name} linked the SMS conversation with ${conversation.phoneNumber} to ${label}`,
			metadata: { conversationId, phoneNumber: conversation.phoneNumber },
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		});

		return ServiceResponse.success("Conversation linked to patient.", {
			conversation: conversationDto(updated),
		});
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
