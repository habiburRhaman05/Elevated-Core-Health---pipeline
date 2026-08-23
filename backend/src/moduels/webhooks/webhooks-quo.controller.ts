import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { verifyWebhookSignature } from "@/lib/quo";
import { handleServiceResponse } from "@/utils/httpHandlers";
import { logger } from "@/utils/logger";
import { ServiceResponse } from "@/utils/serviceResponse";
import { webhooksQuoService } from "./webhooks-quo.service";

export const webhooksQuoController = {
	/**
	 * POST /api/webhooks/quo — public (Quo can't log in as a user), gated by
	 * signature verification instead of requireAuth. Treated exactly as
	 * security-sensitive as /patients/intake: the payload is never processed
	 * before the signature check passes.
	 */
	async handleInbound(req: Request, res: Response): Promise<void> {
		// req.rawBody is captured by express.json()'s verify callback (app.ts).
		// Falling back to a re-stringified body should never actually happen in
		// practice (Content-Type is always application/json on a real Quo
		// delivery) but keeps this from crashing if it ever does.
		console.log(req.body);
		
		const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body ?? {});
console.log("row-boyd",rawBody);

		const verified = verifyWebhookSignature(rawBody, {
			"webhook-id": req.header("webhook-id") ?? undefined,
			"webhook-timestamp": req.header("webhook-timestamp") ?? undefined,
			"webhook-signature": req.header("webhook-signature") ?? undefined,
			"openphone-signature": req.header("openphone-signature") ?? undefined,
		});

		if (!verified) {
			logger.warn({ path: req.path, ip: req.ip }, "Rejected Quo webhook — signature verification failed");
			handleServiceResponse(ServiceResponse.failure("Invalid signature.", null, StatusCodes.UNAUTHORIZED), res);
			return;
		}

		const serviceResponse = await webhooksQuoService.handleInbound(req.body);
		handleServiceResponse(serviceResponse, res);
	},
};
