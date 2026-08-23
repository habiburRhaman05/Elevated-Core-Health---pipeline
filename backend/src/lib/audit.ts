import type { Request } from "express";

import type { AuthenticatedUser } from "@/lib/types";
import { logger } from "@/utils/logger";
import { prisma } from "@/utils/prisma";

/**
 * Coarse grouping for activity_log rows — mirrors the Prisma ActivityCategory
 * enum. Kept as a plain string union here (rather than importing the
 * generated enum type) so this file has no dependency on the Prisma client
 * being regenerated to compile.
 */
export type ActivityCategory =
	| "auth"
	| "profile"
	| "patient"
	| "appointment"
	| "user_management"
	| "report"
	| "system"
	| "messaging";

export interface AuditEntry {
	/** null for system-wide events not tied to a specific patient (login, user mgmt, exports, ...). */
	patientId?: string | null;
	/** null = system action (e.g. webhook intake) */
	user: AuthenticatedUser | null;
	/** Stable machine-readable action id, e.g. "stage.move", "checklist.toggle" */
	action: string;
	entityType?: string;
	entityId?: string;
	prevValue?: unknown;
	newValue?: unknown;
	/** Human-readable summary shown in the handoff log UI */
	message: string;
	type?: "auto" | "manual";
	metadata?: Record<string, unknown>;
	/**
	 * Grouping for the activity log's category filter. Defaults to "patient"
	 * so every pre-existing call site (all of them patient-scoped) keeps
	 * behaving identically without being touched.
	 */
	category?: ActivityCategory;
	/** Request-scoped context (IP/user-agent) — see getRequestContext(). */
	ip?: string | null;
	userAgent?: string | null;
}

/**
 * Field names that must never be written into an audit row's prevValue /
 * newValue / metadata, even if a caller passes them by mistake — passwords,
 * hashes, and tokens are never audit-loggable (task.md §14: "sensitive
 * values should be handled carefully in audit logs").
 */
const REDACTED_KEYS = new Set([
	"password",
	"newpassword",
	"currentpassword",
	"passwordhash",
	"password_hash",
	"token",
	"accesstoken",
	"refreshtoken",
	"passwordresettoken",
	"secret",
	"apikey",
	"api_key",
]);

/** Shallow + one-level-nested redaction — enough for the small objects audit() ever receives. */
function redact(value: unknown, depth = 0): unknown {
	if (value === null || value === undefined || depth > 3) return value;
	if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
	if (typeof value !== "object") return value;

	const out: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
		if (REDACTED_KEYS.has(key.toLowerCase())) {
			out[key] = "[redacted]";
			continue;
		}
		out[key] = redact(val, depth + 1);
	}
	return out;
}

export interface RequestContext {
	ip: string | null;
	userAgent: string | null;
}

/** Extracts IP + user-agent from a request for audit rows. `app.set("trust proxy", 1)` in server.ts makes req.ip reliable. */
export function getRequestContext(req: Request): RequestContext {
	return {
		ip: req.ip ?? null,
		userAgent: req.get("user-agent") ?? null,
	};
}

/**
 * Structured activity tracker. Every meaningful mutation should call this so
 * the handoff log / system-wide activity log can answer: WHO did WHAT, WHAT
 * changed (prev → new), WHEN, and on WHICH entity. Never throws — logging
 * must not break the main flow.
 */
export async function audit(entry: AuditEntry): Promise<void> {
	try {
		await prisma.activityLog.create({
			data: {
				patientId: entry.patientId ?? null,
				author: entry.user?.name ?? "system",
				actorId: entry.user?.id ?? null,
				actorRole: entry.user?.role ?? null,
				actorName: entry.user?.name ?? null,
				action: entry.action,
				entityType: entry.entityType ?? null,
				entityId: entry.entityId ?? null,
				...(entry.prevValue !== undefined ? { prevValue: redact(entry.prevValue) as object } : {}),
				...(entry.newValue !== undefined ? { newValue: redact(entry.newValue) as object } : {}),
				metadata: redact(entry.metadata ?? {}) as object,
				message: entry.message,
				type: entry.type ?? "manual",
				category: entry.category ?? "patient",
				ipAddress: entry.ip ?? null,
				userAgent: entry.userAgent ?? null,
			},
		});
	} catch (err) {
		logger.error({ err, patientId: entry.patientId }, "Failed to write audit log");
	}
}
