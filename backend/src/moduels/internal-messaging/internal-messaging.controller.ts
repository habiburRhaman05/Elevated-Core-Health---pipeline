import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { handleServiceResponse } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { internalMessagingService } from "./internal-messaging.service";

// Same normalizer as messaging.controller.ts's param() / patients.controller.ts's
// paramId() — Express types a route param as `string | string[]`.
function param(req: Request, name: string): string {
	const value = req.params[name];
	return Array.isArray(value) ? value[0] : value;
}

function requireUser(req: Request, res: Response): boolean {
	if (!req.user) {
		handleServiceResponse(ServiceResponse.failure("Not authenticated", null, StatusCodes.UNAUTHORIZED), res);
		return false;
	}
	return true;
}

export const internalMessagingController = {
	async getStatus(_req: Request, res: Response): Promise<void> {
		handleServiceResponse(await internalMessagingService.getStatus(), res);
	},

	async listConversations(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await internalMessagingService.listConversations(req.user!), res);
	},

	async startConversation(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await internalMessagingService.startConversation(req.user!, req.body.userId), res);
	},

	async getMessages(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await internalMessagingService.getMessages(param(req, "id"), req.user!, req.query as Record<string, unknown>),
			res,
		);
	},

	async sendMessage(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await internalMessagingService.sendMessage(param(req, "id"), req.user!, {
				body: req.body.body,
				attachments: req.body.attachments,
			}),
			res,
		);
	},

	async markRead(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await internalMessagingService.markRead(param(req, "id"), req.user!), res);
	},

	async uploadAttachment(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		if (!req.file) {
			handleServiceResponse(ServiceResponse.failure("No file was uploaded", null, StatusCodes.BAD_REQUEST), res);
			return;
		}
		handleServiceResponse(await internalMessagingService.uploadAttachment(req.file), res);
	},
};
