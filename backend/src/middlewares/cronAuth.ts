import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { env } from "@/utils/envConfig";
import { handleServiceResponse } from "@/utils/httpHandlers";
import { logger } from "@/utils/logger";
import { ServiceResponse } from "@/utils/serviceResponse";

/** Constant-time compare — same reasoning as klarityAuth.ts's safeEqual. */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

/**
 * Guards the Grow Therapy calendar sync route. This route is never pushed to
 * by an outside vendor (unlike /intake/klarity) — it's OUR OWN scheduler
 * calling in. Vercel Cron automatically attaches `Authorization: Bearer
 * <CRON_SECRET>` to every scheduled invocation when CRON_SECRET is set in the
 * project's env vars, so checking that header is exactly Vercel's own
 * documented convention, not something bespoke.
 *
 * Deliberately permissive when CRON_SECRET is unset:
 *   - In development the route isn't even the trigger path (src/index.ts's
 *     node-cron loop calls patientsService.syncGrowTherapy() directly), so
 *     this only affects a developer manually curling the route locally.
 *   - In production, an unset CRON_SECRET is a genuine misconfiguration — the
 *     route stays reachable rather than silently 401-ing forever, but a
 *     prominent warning is logged on every hit so it doesn't go unnoticed.
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
	if (!env.CRON_SECRET) {
		if (env.isProduction) {
			logger.warn(
				{ path: req.path, ip: req.ip },
				"Grow Therapy sync route hit with no CRON_SECRET configured — anyone can trigger this sync. Set CRON_SECRET.",
			);
		}
		next();
		return;
	}

	const header = req.headers.authorization;
	const expected = `Bearer ${env.CRON_SECRET}`;

	if (!header || !safeEqual(header.trim(), expected)) {
		logger.warn({ path: req.path, ip: req.ip }, "Grow Therapy sync route rejected — invalid or missing cron secret");
		handleServiceResponse(ServiceResponse.failure("Invalid or missing cron secret.", null, StatusCodes.UNAUTHORIZED), res);
		return;
	}

	next();
}
