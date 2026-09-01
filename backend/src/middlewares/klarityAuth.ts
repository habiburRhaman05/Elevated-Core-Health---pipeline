import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { env } from "@/utils/envConfig";
import { handleServiceResponse } from "@/utils/httpHandlers";
import { logger } from "@/utils/logger";
import { ServiceResponse } from "@/utils/serviceResponse";

/**
 * Constant-time string compare, so a caller can't recover the token one byte at
 * a time by measuring how fast we reject it. Length is compared first (and does
 * leak, which is fine — the token length isn't the secret).
 */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

/**
 * Guards the Klarity intake webhook. Klarity can't hold a user session, so the
 * request is authenticated by a static bearer token on the Authorization
 * header instead — the full header value (including the "Bearer " prefix) must
 * equal env.KLARITY_WEBHOOK_TOKEN.
 */
export function requireKlarityToken(req: Request, res: Response, next: NextFunction): void {
	const header = req.headers.authorization;

	if (!header) {
		logger.warn({ path: req.path, ip: req.ip }, "Klarity webhook rejected — missing Authorization header");
		handleServiceResponse(ServiceResponse.failure("Missing Authorization header.", null, StatusCodes.UNAUTHORIZED), res);
		return;
	}

	// The scheme is case-insensitive per RFC 7235, but the token itself is not.
	if (!/^Bearer\s/i.test(header)) {
		logger.warn({ path: req.path, ip: req.ip }, "Klarity webhook rejected — Authorization is not a Bearer token");
		handleServiceResponse(ServiceResponse.failure("Authorization header must be a Bearer token.", null, StatusCodes.UNAUTHORIZED), res);
		return;
	}

	if (!safeEqual(header.trim(), env.KLARITY_WEBHOOK_TOKEN.trim())) {
		logger.warn({ path: req.path, ip: req.ip }, "Klarity webhook rejected — invalid bearer token");
		handleServiceResponse(ServiceResponse.failure("Invalid webhook token.", null, StatusCodes.UNAUTHORIZED), res);
		return;
	}

	next();
}
