import crypto from "node:crypto";

import { env } from "@/utils/envConfig";
import { logger } from "@/utils/logger";

/**
 * Small wrapper around the Quo (formerly OpenPhone) REST API
 * (https://api.quo.com/v1) — not a full SDK, just what the messaging module
 * needs. Built from Quo's published docs (quo.com/docs, support.quo.com) as
 * of 2026-08-23; not yet exercised against a real API key or a real webhook
 * delivery — QUO_API_KEY / QUO_WEBHOOK_SIGNING_SECRET haven't been issued
 * yet. Confirm behavior against a real send + a real webhook test-send once
 * available, and adjust if Quo's actual responses differ from the docs.
 */

const QUO_API_BASE = "https://api.quo.com/v1";

export const isQuoConfigured = Boolean(env.QUO_API_KEY);

export class QuoApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = "QuoApiError";
		this.status = status;
	}
}

export interface SendMessageParams {
	/** E.164, e.g. "+15551234567" */
	to: string;
	/** The clinic's business number, E.164 — from listPhoneNumbers(). */
	from: string;
	/** Quo user id that owns `from` — from listPhoneNumbers(). */
	userId: string;
	content: string;
}

export interface SendMessageResult {
	id: string;
	status: string;
}

/**
 * POST /v1/messages. Quo's documented request body takes `to` as an array
 * (multi-recipient) — this wrapper only ever sends to one patient at a time,
 * so it takes a single `to` and wraps it.
 */
export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
	if (!env.QUO_API_KEY) {
		// Defense in depth — messaging.service.ts checks isQuoConfigured before
		// ever reaching here, but this function must never silently no-op if
		// called directly.
		throw new QuoApiError("Quo API key is not configured", 503);
	}

	let res: Response;
	try {
		res = await fetch(`${QUO_API_BASE}/messages`, {
			method: "POST",
			headers: {
				// Quo does NOT use a Bearer prefix — the raw key is the header value.
				Authorization: env.QUO_API_KEY,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				content: params.content,
				from: params.from,
				to: [params.to],
				userId: params.userId,
			}),
		});
	} catch (err) {
		logger.error({ err }, "Quo sendMessage: network error reaching api.quo.com");
		throw new QuoApiError("Could not reach Quo — check network/DNS.", 502);
	}

	const body: unknown = await res.json().catch(() => null);

	if (!res.ok) {
		const message =
			(body as { message?: string; error?: string } | null)?.message ??
			(body as { message?: string; error?: string } | null)?.error ??
			`Quo API error (HTTP ${res.status})`;
		throw new QuoApiError(message, res.status);
	}

	// Quo's docs confirm a 202 on success but don't fully specify the response
	// body shape — defensively unwrap either `{ data: { id, status } }` or a
	// flat `{ id, status }` rather than assuming one.
	const data = ((body as { data?: Record<string, unknown> } | null)?.data ?? body ?? {}) as Record<string, unknown>;
	return {
		id: typeof data.id === "string" ? data.id : "",
		status: typeof data.status === "string" ? data.status : "sent",
	};
}

export interface QuoPhoneNumber {
	id: string;
	/** E.164, e.g. "+15615761861". Quo also calls this `number` on some responses. */
	phoneNumber?: string;
	number?: string;
	/** Pretty form Quo returns for display, e.g. "(561) 576-1861". */
	formattedNumber?: string;
	/**
	 * NOTE: Quo's real GET /v1/phone-numbers response does NOT have a
	 * top-level `userId` field, despite what earlier docs implied - it has a
	 * `users` array instead (each with its own `id`/`role`). `userId` is kept
	 * here only in case a future/older API version does return it directly;
	 * resolveOwnerUserId() below is what actually extracts a usable id.
	 */
	userId?: string;
	users?: Array<{ id: string; role?: string; email?: string }>;
	name?: string;
	/**
	 * Per-capability regional restrictions. A number whose US messaging is
	 * "restricted" cannot send SMS at all - see getMessagingCapableNumbers().
	 */
	restrictions?: {
		messaging?: Record<string, string | undefined>;
		calling?: Record<string, string | undefined>;
	};
}

/** Resolves a usable Quo userId for a number: the top-level field if present
 *  (older/alternate API shape), else the "owner" in `users[]`, else the
 *  first user listed. */
function resolveOwnerUserId(n: QuoPhoneNumber): string | undefined {
	if (n.userId) return n.userId;
	const users = n.users ?? [];
	return users.find((u) => u.role === "owner")?.id ?? users[0]?.id;
}

/**
 * Every number on the workspace, view-ready - shown in the UI's Inboxes
 * toggle regardless of whether it can actually send (mirrors Quo's own
 * dashboard, which lists every inbox). `messagingCapable` is what gates
 * sending, not visibility - see getMessagingCapableNumbers().
 */
export interface WorkspaceNumber {
	id: string;
	phoneNumberId: string;
	phoneNumber: string;
	formattedNumber: string;
	userId: string | null;
	messagingCapable: boolean;
}

/** Narrowed, send-ready view of a Quo number that can actually do US SMS. */
export interface MessagingCapableNumber {
	/** Quo's phone-number id (e.g. "PN3lxEXr7a"). */
	id: string;
	/** Same value as `id` - kept as its own field so callers reading a
	 *  `phoneNumberId` off this object don't have to know they're equal. */
	phoneNumberId: string;
	/** E.164 - what the send API wants as `from`. */
	phoneNumber: string;
	/** Display label, e.g. "(561) 576-1861". */
	formattedNumber: string;
	userId: string;
}

/**
 * GET /v1/phone-numbers. Not exposed as a route — a one-off lookup to find
 * the clinic's business number's `userId`/`from` value for QUO env config.
 * Run it with: `npx tsx -e "import('./src/lib/quo').then(m => m.listPhoneNumbers().then(console.log))"`
 * once QUO_API_KEY is set.
 */
export async function listPhoneNumbers(): Promise<QuoPhoneNumber[]> {
	if (!env.QUO_API_KEY) {
		throw new QuoApiError("Quo API key is not configured", 503);
	}

	const res = await fetch(`${QUO_API_BASE}/phone-numbers`, {
		headers: { Authorization: env.QUO_API_KEY },
	});
	const body: unknown = await res.json().catch(() => null);

	if (!res.ok) {
		const message = (body as { message?: string } | null)?.message ?? `Quo API error (HTTP ${res.status})`;
		throw new QuoApiError(message, res.status);
	}

	const list = Array.isArray((body as { data?: unknown } | null)?.data)
		? ((body as { data: unknown[] }).data as unknown[])
		: Array.isArray(body)
			? body
			: [];
	return list as QuoPhoneNumber[];
}

/**
 * Every number on the workspace, cached in-process for a few minutes so the
 * inbox toggle and every send don't each hit Quo's API separately.
 *
 * Deliberately does NOT drop restricted numbers - the toggle needs to show
 * every inbox (same as Quo's own dashboard) so a VA/admin can switch to and
 * view any of them, e.g. an inbox that only handles calls. What a restricted
 * number can't do is SEND - that's enforced separately below, server-side,
 * so there is no code path (UI, API call, or crafted request) that can
 * actually dispatch an SMS through a restricted number even if its id is
 * selected in the toggle or passed by hand.
 */
const NUMBERS_CACHE_TTL_MS = 5 * 60 * 1000;
let numbersCache: { at: number; value: WorkspaceNumber[] } | null = null;

export function clearMessagingNumbersCache(): void {
	numbersCache = null;
}

export async function getWorkspaceNumbers(): Promise<WorkspaceNumber[]> {
	if (!env.QUO_API_KEY) return [];

	if (numbersCache && Date.now() - numbersCache.at < NUMBERS_CACHE_TTL_MS) {
		return numbersCache.value;
	}

	let raw: QuoPhoneNumber[];
	try {
		raw = await listPhoneNumbers();
	} catch (err) {
		logger.error({ err }, "Could not load Quo phone numbers");
		// Serve a stale cache rather than pretending the workspace has no
		// numbers (which would disable the whole feature on a transient blip).
		return numbersCache?.value ?? [];
	}

	const numbers: WorkspaceNumber[] = [];
	for (const n of raw) {
		const e164 = n.phoneNumber ?? n.number;
		if (!n.id || !e164) continue;
		const userId = resolveOwnerUserId(n) ?? null;
		const messagingCapable = userId !== null && n.restrictions?.messaging?.US !== "restricted";
		if (!messagingCapable) {
			logger.info(
				{ phoneNumberId: n.id, hasUserId: userId !== null },
				"Quo number can be viewed but not sent from (restricted or no owning user)",
			);
		}
		numbers.push({
			id: n.id,
			phoneNumberId: n.id,
			phoneNumber: e164,
			formattedNumber: n.formattedNumber ?? e164,
			userId,
			messagingCapable,
		});
	}

	numbersCache = { at: Date.now(), value: numbers };
	return numbers;
}

/**
 * The strict subset of getWorkspaceNumbers() that can actually send US SMS.
 * This is the ONLY list sendMessage()/messaging.service.ts may resolve a
 * `from` against - never getWorkspaceNumbers() directly.
 */
export async function getMessagingCapableNumbers(): Promise<MessagingCapableNumber[]> {
	const all = await getWorkspaceNumbers();
	return all
		.filter((n): n is WorkspaceNumber & { userId: string } => n.messagingCapable && n.userId !== null)
		.map((n) => ({
			id: n.id,
			phoneNumberId: n.phoneNumberId,
			phoneNumber: n.phoneNumber,
			formattedNumber: n.formattedNumber,
			userId: n.userId,
		}));
}

/** Resolves one capable (send-ready) number by its Quo phone-number id, or null. */
export async function findMessagingCapableNumber(phoneNumberId: string): Promise<MessagingCapableNumber | null> {
	const numbers = await getMessagingCapableNumbers();
	return numbers.find((n) => n.phoneNumberId === phoneNumberId) ?? null;
}

// --------------------------------------------------------------------------
// Read-only API helpers — pull existing data FROM Quo into our local DB
// --------------------------------------------------------------------------

export interface QuoContact {
	id: string;
	externalId?: string;
	source?: string;
	defaultFields?: {
		firstName?: string;
		lastName?: string;
		company?: string;
		role?: string;
		phoneNumbers?: { name?: string; value: string; id?: string }[];
		emails?: { name?: string; value: string; id?: string }[];
	};
	createdAt?: string;
	updatedAt?: string;
}

/**
 * GET /v1/contacts — fetches all contacts from the Quo workspace.
 * Paginated via nextPageToken; this function fetches ALL pages.
 */
export async function listContacts(): Promise<QuoContact[]> {
	if (!env.QUO_API_KEY) {
		throw new QuoApiError("Quo API key is not configured", 503);
	}

	const allContacts: QuoContact[] = [];
	let pageToken: string | undefined;

	do {
		const url = new URL(`${QUO_API_BASE}/contacts`);
		url.searchParams.set("maxResults", "100");
		if (pageToken) url.searchParams.set("pageToken", pageToken);

		const res = await fetch(url.toString(), {
			headers: { Authorization: env.QUO_API_KEY },
		});
		const body: unknown = await res.json().catch(() => null);

		if (!res.ok) {
			const message = (body as { message?: string } | null)?.message ?? `Quo API error (HTTP ${res.status})`;
			throw new QuoApiError(message, res.status);
		}

		const data = (body as { data?: QuoContact[] })?.data ?? [];
		allContacts.push(...data);
		pageToken = (body as { nextPageToken?: string })?.nextPageToken ?? undefined;
	} while (pageToken);

	return allContacts;
}

/**
 * Looks up a single contact by phone number from the Quo workspace's contact
 * list. Uses the existing paginated listContacts() and filters client-side —
 * Quo's REST API doesn't expose a server-side phone-number filter on
 * GET /v1/contacts. Called only once per new unmatched conversation (not on
 * every poll), so the full-list fetch is acceptable.
 *
 * Returns the contact's display name (firstName + lastName) if found, or null.
 */
export async function findContactNameByPhoneNumber(e164Phone: string): Promise<string | null> {
	try {
		const contacts = await listContacts();
		// Normalize the incoming number to digits-only for loose matching
		// (patient.phone isn't guaranteed stored E.164).
		const targetDigits = e164Phone.replace(/\D/g, "");
		if (!targetDigits) return null;

		for (const contact of contacts) {
			const phoneNumbers = contact.defaultFields?.phoneNumbers ?? [];
			for (const pn of phoneNumbers) {
				const pnDigits = (pn.value ?? "").replace(/\D/g, "");
				if (pnDigits && pnDigits.endsWith(targetDigits.slice(-10))) {
					const name = [contact.defaultFields?.firstName, contact.defaultFields?.lastName]
						.filter(Boolean)
						.join(" ")
						.trim();
					return name || null;
				}
			}
		}
	} catch (err) {
		logger.warn({ err, phone: e164Phone }, "Failed to look up Quo contact by phone number");
	}
	return null;
}

export interface QuoConversation {
	id: string;
	assignedTo?: string;
	createdAt?: string;
	updatedAt?: string;
	lastActivityAt?: string;
	lastActivityId?: string;
	name?: string;
	participants: string[];
	phoneNumberId?: string;
}

/**
 * GET /v1/conversations — fetches all conversations from the Quo workspace.
 * Paginated via nextPageToken; this function fetches ALL pages.
 * Optionally scoped to a userId.
 */
export async function listQuoConversations(userId?: string): Promise<QuoConversation[]> {
	if (!env.QUO_API_KEY) {
		throw new QuoApiError("Quo API key is not configured", 503);
	}

	const allConversations: QuoConversation[] = [];
	let pageToken: string | undefined;

	do {
		const url = new URL(`${QUO_API_BASE}/conversations`);
		url.searchParams.set("maxResults", "100");
		if (userId) url.searchParams.set("userId", userId);
		if (pageToken) url.searchParams.set("pageToken", pageToken);

		const res = await fetch(url.toString(), {
			headers: { Authorization: env.QUO_API_KEY },
		});
		const body: unknown = await res.json().catch(() => null);

		if (!res.ok) {
			const message = (body as { message?: string } | null)?.message ?? `Quo API error (HTTP ${res.status})`;
			throw new QuoApiError(message, res.status);
		}

		const data = (body as { data?: QuoConversation[] })?.data ?? [];
		allConversations.push(...data);
		pageToken = (body as { nextPageToken?: string })?.nextPageToken ?? undefined;
	} while (pageToken);

	return allConversations;
}

export interface QuoMessage {
	id: string;
	to: string[];
	from: string;
	text: string;
	phoneNumberId?: string;
	conversationId?: string;
	direction: string;
	userId?: string;
	status?: string;
	createdAt?: string;
	updatedAt?: string;
	/** Confirmed live: `[]` when empty; docs confirm `{ type?, url }` entries when populated. */
	media?: Array<{ type?: string | null; url: string }>;
}

/**
 * GET /v1/messages — fetches messages for a specific participant phone number.
 * Requires phoneNumberId and at least one participant (E.164).
 */
export async function listQuoMessages(params: {
	phoneNumberId: string;
	participants: string[];
	maxResults?: number;
}): Promise<QuoMessage[]> {
	if (!env.QUO_API_KEY) {
		throw new QuoApiError("Quo API key is not configured", 503);
	}

	const allMessages: QuoMessage[] = [];
	let pageToken: string | undefined;

	do {
		const url = new URL(`${QUO_API_BASE}/messages`);
		url.searchParams.set("phoneNumberId", params.phoneNumberId);
		for (const p of params.participants) {
			url.searchParams.append("participants", p);
		}
		url.searchParams.set("maxResults", String(params.maxResults ?? 100));
		if (pageToken) url.searchParams.set("pageToken", pageToken);

		const res = await fetch(url.toString(), {
			headers: { Authorization: env.QUO_API_KEY },
		});
		const body: unknown = await res.json().catch(() => null);

		if (!res.ok) {
			const message = (body as { message?: string } | null)?.message ?? `Quo API error (HTTP ${res.status})`;
			throw new QuoApiError(message, res.status);
		}

		const data = (body as { data?: QuoMessage[] })?.data ?? [];
		allMessages.push(...data);
		pageToken = (body as { nextPageToken?: string })?.nextPageToken ?? undefined;
	} while (pageToken);

	return allMessages;
}

/**
 * GET /v1/calls — call history for a phone number + participant, per Quo's
 * documented shape (quo.com/docs/mdx/api-reference/calls/list-calls, checked
 * 2026-08-25): direction "incoming"|"outgoing", status is one of queued |
 * initiated | ringing | in-progress | completed | busy | failed | no-answer |
 * canceled | missed | answered | forwarded | abandoned. `duration` is
 * seconds. Not yet exercised against real call data (this workspace's
 * capable number had no calls at audit time) - confirm once real calls
 * exist, same caveat as the rest of this file's "built from docs" endpoints.
 */
export interface QuoCall {
	id: string;
	phoneNumberId: string;
	userId?: string;
	direction: string;
	status: string;
	participants: string[];
	duration?: number;
	createdAt: string;
	answeredAt?: string | null;
	completedAt?: string | null;
}

export async function listCalls(params: {
	phoneNumberId: string;
	participants: string[];
	maxResults?: number;
}): Promise<QuoCall[]> {
	if (!env.QUO_API_KEY) {
		throw new QuoApiError("Quo API key is not configured", 503);
	}

	const allCalls: QuoCall[] = [];
	let pageToken: string | undefined;

	do {
		const url = new URL(`${QUO_API_BASE}/calls`);
		url.searchParams.set("phoneNumberId", params.phoneNumberId);
		for (const p of params.participants) {
			url.searchParams.append("participants", p);
		}
		url.searchParams.set("maxResults", String(params.maxResults ?? 100));
		if (pageToken) url.searchParams.set("pageToken", pageToken);

		const res = await fetch(url.toString(), {
			headers: { Authorization: env.QUO_API_KEY },
		});
		const body: unknown = await res.json().catch(() => null);

		if (!res.ok) {
			const message = (body as { message?: string } | null)?.message ?? `Quo API error (HTTP ${res.status})`;
			throw new QuoApiError(message, res.status);
		}

		const data = (body as { data?: QuoCall[] })?.data ?? [];
		allCalls.push(...data);
		pageToken = (body as { nextPageToken?: string })?.nextPageToken ?? undefined;
	} while (pageToken);

	return allCalls;
}

// --------------------------------------------------------------------------
// Webhook signature verification
// --------------------------------------------------------------------------

export interface QuoWebhookHeaders {
	/** Current (Standard Webhooks-compatible) scheme */
	"webhook-id"?: string;
	"webhook-timestamp"?: string;
	"webhook-signature"?: string;
	/** Legacy scheme */
	"openphone-signature"?: string;
}

/** 5 minutes — matches Quo's own documented replay-attack tolerance. */
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

function timingSafeEqualStrings(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) return false;
	return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a Quo webhook request against QUO_WEBHOOK_SIGNING_SECRET. Quo has
 * shipped two signing schemes — this checks whichever headers are actually
 * present rather than assuming one, so the webhook handler works regardless
 * of which delivery format this workspace is on:
 *
 *  - Current (Standard Webhooks-compatible): `webhook-id` / `webhook-timestamp`
 *    / `webhook-signature` headers, secret formatted `whsec_<base64>`.
 *    signedContent = `${id}.${timestamp}.${rawBody}`, HMAC-SHA256, base64.
 *    `webhook-signature` is a space-separated list of `v1,<base64sig>`
 *    entries — any match is accepted (supports secret rotation).
 *  - Legacy: `openphone-signature: hmac;1;<timestamp>;<base64sig>`,
 *    signedContent = `${timestamp}.${rawBody}`, HMAC-SHA256 keyed by the
 *    base64-decoded secret, base64 digest.
 *
 * `rawBody` MUST be the exact bytes Quo signed (before any JSON.parse — even
 * whitespace differences break the signature), which is why the webhook
 * route must be mounted with a raw-body parser instead of the app's normal
 * JSON body parser. See webhooks-quo.router.ts.
 */
export function verifyWebhookSignature(rawBody: string, headers: QuoWebhookHeaders): boolean {
	const secret = env.QUO_WEBHOOK_SIGNING_SECRET;
	if (!secret) {
		logger.error(
			"QUO_WEBHOOK_SIGNING_SECRET is not configured — refusing to verify (and therefore accept) any Quo webhook",
		);
		return false;
	}

	const modernId = headers["webhook-id"];
	const modernTimestamp = headers["webhook-timestamp"];
	const modernSignature = headers["webhook-signature"];
	if (modernId && modernTimestamp && modernSignature) {
		return verifyModernSignature(rawBody, modernId, modernTimestamp, modernSignature, secret);
	}

	const legacySignature = headers["openphone-signature"];
	if (legacySignature) {
		return verifyLegacySignature(rawBody, legacySignature, secret);
	}

	logger.warn("Quo webhook request had no recognized signature header — rejecting");
	return false;
}

function verifyModernSignature(
	rawBody: string,
	id: string,
	timestamp: string,
	signatureHeader: string,
	secret: string,
): boolean {
	const timestampSeconds = Number(timestamp);
	if (!Number.isFinite(timestampSeconds)) return false;
	const skewSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
	if (skewSeconds > MAX_TIMESTAMP_SKEW_SECONDS) {
		logger.warn({ skewSeconds }, "Quo webhook timestamp outside allowed skew — rejecting (possible replay)");
		return false;
	}

	const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
	const signedContent = `${id}.${timestamp}.${rawBody}`;
	const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

	return signatureHeader.split(" ").some((entry) => {
		const [, sig] = entry.split(",");
		return sig ? timingSafeEqualStrings(sig, expected) : false;
	});
}

function verifyLegacySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
	const parts = signatureHeader.split(";");
	if (parts.length !== 4) return false;
	const [, , timestamp, providedDigest] = parts;

	const timestampMs = Number(timestamp);
	if (!Number.isFinite(timestampMs)) return false;
	const skewSeconds = Math.abs(Date.now() - timestampMs) / 1000;
	if (skewSeconds > MAX_TIMESTAMP_SKEW_SECONDS) {
		logger.warn({ skewSeconds }, "Quo webhook (legacy signature) timestamp outside allowed skew — rejecting");
		return false;
	}

	const signedData = `${timestamp}.${rawBody}`;
	const signingKeyBinary = Buffer.from(secret, "base64");
	const expected = crypto.createHmac("sha256", signingKeyBinary).update(signedData, "utf8").digest("base64");

	return timingSafeEqualStrings(providedDigest, expected);
}
