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
	phoneNumber: string;
	userId?: string;
	name?: string;
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
