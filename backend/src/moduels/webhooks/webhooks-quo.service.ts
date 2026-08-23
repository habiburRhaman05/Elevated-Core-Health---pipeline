import { audit } from "@/lib/audit";
import { normalizeE164, phoneDigits10 } from "@/lib/phone";
import { logger } from "@/utils/logger";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";

interface ParsedInboundMessage {
	quoMessageId: string | null;
	fromNumber: string;
	body: string;
	hasMedia: boolean;
}

/**
 * Quo's docs describe two payload shapes for message.received (as of
 * 2026-08-23 — see lib/quo.ts's header comment, this hasn't been confirmed
 * against a real delivery yet):
 *   Current:  { data: { resource: { id, text, media, ... }, context: { senderIdentifier, ... } } }
 *   Legacy:   { data: { object: { id, from, body, media, ... } } }
 * Parsed defensively against both rather than hardcoding one path, per the
 * plan's explicit instruction not to guess a single shape.
 */
function parseInboundMessage(payload: unknown): ParsedInboundMessage | null {
	const data = (payload as { data?: Record<string, unknown> } | null)?.data;
	if (!data || typeof data !== "object") return null;

	const resource = data.resource as Record<string, unknown> | undefined;
	const context = data.context as Record<string, unknown> | undefined;
	if (resource && context) {
		const from = context.senderIdentifier;
		const text = resource.text;
		if (typeof from !== "string" || typeof text !== "string") return null;
		return {
			quoMessageId: typeof resource.id === "string" ? resource.id : null,
			fromNumber: from,
			body: text,
			hasMedia: Array.isArray(resource.media) && resource.media.length > 0,
		};
	}

	const object = data.object as Record<string, unknown> | undefined;
	if (object) {
		const from = object.from;
		const body = object.body;
		if (typeof from !== "string" || typeof body !== "string") return null;
		return {
			quoMessageId: typeof object.id === "string" ? object.id : null,
			fromNumber: from,
			body,
			hasMedia: Array.isArray(object.media) && object.media.length > 0,
		};
	}

	return null;
}

interface PatientCandidate {
	id: string;
	firstName: string;
	lastName: string | null;
	updatedAt: Date;
}

class WebhooksQuoService {
	/**
	 * Called only after the caller has already verified the request signature.
	 * Always returns a 200-shaped success response quickly — per the plan,
	 * this handler must never do slow work or make Quo think delivery failed
	 * just because the payload was unexpected. Unrecognized event types /
	 * payload shapes are logged and acknowledged, never thrown.
	 */
	async handleInbound(payload: unknown) {
		const eventType = (payload as { type?: string } | null)?.type;

		// message.delivered is a status update on OUR OWN outbound sends, not a
		// new inbound message — nothing to do with it here. Any other event
		// type this workspace might be subscribed to is likewise ignored.
		if (eventType !== "message.received") {
			return ServiceResponse.success("Ignored (not an inbound message event).", null);
		}

		const parsed = parseInboundMessage(payload);
		if (!parsed) {
			logger.error({ payload }, "Quo webhook: message.received payload didn't match a known shape");
			return ServiceResponse.success("Accepted — payload shape not recognized, logged for review.", null);
		}

		const normalizedFrom = normalizeE164(parsed.fromNumber);
		if (!normalizedFrom) {
			logger.error({ from: parsed.fromNumber }, "Quo webhook: could not normalize sender phone number");
			return ServiceResponse.success("Accepted — sender number could not be normalized, logged for review.", null);
		}

		// Idempotency — Quo can redeliver the same event more than once.
		if (parsed.quoMessageId) {
			const existing = await prisma.smsMessage.findUnique({ where: { quoMessageId: parsed.quoMessageId } });
			if (existing) {
				return ServiceResponse.success("Already recorded (duplicate delivery).", null);
			}
		}

		const digits = phoneDigits10(normalizedFrom);

		// Match by phone, loosely (patient.phone isn't guaranteed stored E.164).
		// Multiple patients can share a number (e.g. family booking) — link to
		// the most recently updated one and flag the ambiguity below rather
		// than silently guessing which one is right (per requirements doc §5.4).
		const candidates = digits
			? await prisma.$queryRaw<PatientCandidate[]>`
					SELECT id, first_name as "firstName", last_name as "lastName", updated_at as "updatedAt"
					FROM patients
					WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${`%${digits}`}
					ORDER BY updated_at DESC
				`
			: [];
		const matchedPatient = candidates[0] ?? null;

		let conversation = await prisma.smsConversation.findUnique({ where: { phoneNumber: normalizedFrom } });
		if (!conversation) {
			conversation = await prisma.smsConversation.create({
				data: {
					phoneNumber: normalizedFrom,
					patientId: matchedPatient?.id ?? null,
					lastMessageAt: new Date(),
					lastMessagePreview: parsed.body.slice(0, 200),
					unreadCount: 1,
				},
			});
		} else {
			conversation = await prisma.smsConversation.update({
				where: { id: conversation.id },
				data: {
					// Never move a conversation FROM one patient TO another here —
					// only fill in a link that was previously null (unmatched bucket).
					patientId: conversation.patientId ?? matchedPatient?.id ?? null,
					lastMessageAt: new Date(),
					lastMessagePreview: parsed.body.slice(0, 200),
					unreadCount: { increment: 1 },
				},
			});
		}

		const message = await prisma.smsMessage.create({
			data: {
				conversationId: conversation.id,
				direction: "inbound",
				body: parsed.body,
				status: "received",
				quoMessageId: parsed.quoMessageId,
			},
		});

		const label = matchedPatient
			? `${matchedPatient.firstName} ${matchedPatient.lastName ?? ""}`.trim()
			: normalizedFrom;

		// Hard requirement (Phase 3.5) — system action, user: null, same
		// convention the existing /patients/intake webhook already uses.
		await audit({
			user: null,
			patientId: conversation.patientId ?? null,
			action: "sms.received",
			category: "messaging",
			entityType: "sms_message",
			entityId: message.id,
			message: conversation.patientId
				? `Inbound SMS received from ${label}`
				: `Inbound SMS received from unmatched number ${normalizedFrom}`,
			type: "auto",
			metadata: { conversationId: conversation.id, phoneNumber: normalizedFrom, hasMedia: parsed.hasMedia },
		});

		if (candidates.length > 1) {
			logger.warn(
				{ phoneNumber: normalizedFrom, candidateIds: candidates.map((c) => c.id) },
				"Quo webhook: multiple patients share this phone number — linked to most recently updated, needs human review",
			);
			await audit({
				user: null,
				patientId: matchedPatient?.id ?? null,
				action: "sms.ambiguous_match",
				category: "messaging",
				entityType: "sms_conversation",
				entityId: conversation.id,
				message: `${candidates.length} patients share phone number ${normalizedFrom} — this inbound SMS was linked to the most recently updated one (${label}). Please verify this is the right patient.`,
				type: "auto",
				metadata: {
					conversationId: conversation.id,
					phoneNumber: normalizedFrom,
					candidateIds: candidates.map((c) => c.id),
				},
			});
		}

		if (parsed.hasMedia) {
			// MMS is explicitly out of scope (plan constraint #7) — the text
			// portion is still stored above; only the media itself is skipped.
			logger.warn(
				{ conversationId: conversation.id, messageId: message.id },
				"Quo webhook: inbound message included media (MMS) — text stored, media not downloaded/stored",
			);
		}

		return ServiceResponse.success("Inbound message recorded.", {
			conversationId: conversation.id,
			messageId: message.id,
		});
	}
}

export const webhooksQuoService = new WebhooksQuoService();
