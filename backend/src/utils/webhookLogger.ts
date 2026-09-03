/**
 * Durable record of every webhook hit (Optimantra's `/intake` and Klarity's
 * `/intake/klarity`) — the raw request body exactly as received, and the
 * response we sent back. This is what let us settle the "is Klarity's
 * `startAt` really UTC, or local-time-with-a-Z" question definitively instead
 * of guessing: the log has the literal string Klarity put on the wire.
 *
 * WHY POSTGRES, NOT A LOG FILE: this backend deploys to Vercel as a
 * serverless function. Vercel's filesystem is read-only outside `/tmp` and
 * not shared across invocations — a file written during one request would not
 * exist for the next one, let alone survive a redeploy. A `WebhookLog` row in
 * the same Neon database everything else already uses behaves identically in
 * local dev and in production, and survives every deploy.
 *
 * PHI note: intake payloads carry patient name, DOB, phone, email — the same
 * data already stored in `patients`. This table is exactly as protected as
 * every other table in this database (same encryption at rest, same access
 * controls, same backups) — nothing here is written anywhere less secure than
 * the rest of the app's data already lives.
 */
import { prisma } from "@/utils/prisma";
import { logger } from "@/utils/logger";

export type WebhookSource = "optimantra" | "klarity";

interface WebhookRequestLogEntry {
	direction: "request";
	source: WebhookSource;
	method: string;
	path: string;
	ip?: string;
	/** Raw body exactly as received — before any normalization/flattening this app applies. */
	body: unknown;
}

interface WebhookResponseLogEntry {
	direction: "response";
	source: WebhookSource;
	method: string;
	path: string;
	statusCode: number;
	durationMs: number;
	response: unknown;
}

type WebhookLogEntry = WebhookRequestLogEntry | WebhookResponseLogEntry;

/**
 * Writes one row to the `webhook_logs` table. Fire-and-forget from the
 * caller's perspective (never awaited by the request/response cycle) and
 * never throws — a logging failure must never break the webhook itself, so
 * any DB error here is caught and only written to the ordinary app logger.
 */
export function logWebhookPayload(entry: WebhookLogEntry): void {
	const base = {
		source: entry.source,
		direction: entry.direction,
		method: entry.method,
		path: entry.path,
	};

	const write =
		entry.direction === "request"
			? prisma.webhookLog.create({
					data: { ...base, ip: entry.ip ?? null, payload: entry.body as object },
				})
			: prisma.webhookLog.create({
					data: {
						...base,
						statusCode: entry.statusCode,
						durationMs: entry.durationMs,
						payload: entry.response as object,
					},
				});

	write.catch((err) => {
		logger.error({ err, source: entry.source, direction: entry.direction }, "Failed to write webhook payload log — continuing without it");
	});
}

/**
 * Express middleware: logs the incoming request body immediately (so even a
 * request that later fails auth/validation is captured), then patches
 * `res.json` to also log the outgoing response once it's sent. Mount this as
 * the FIRST middleware on a webhook route, before auth/validation.
 */
export function webhookPayloadLogger(source: WebhookSource) {
	return function (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
		const startedAt = Date.now();

		logWebhookPayload({
			direction: "request",
			source,
			method: req.method,
			path: req.originalUrl,
			ip: req.ip,
			body: req.body,
		});

		const originalJson = res.json.bind(res);
		res.json = (body: unknown) => {
			logWebhookPayload({
				direction: "response",
				source,
				method: req.method,
				path: req.originalUrl,
				statusCode: res.statusCode,
				durationMs: Date.now() - startedAt,
				response: body,
			});
			return originalJson(body);
		};

		next();
	};
}
