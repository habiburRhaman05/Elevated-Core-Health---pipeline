import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { handleServiceResponse } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { internalMessagingService, type MessageTarget } from "./internal-messaging.service";

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

	/** Phase 2 auto-synced sidebar — every teammate, merged with conversation status. */
	async getRoster(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await internalMessagingService.getRoster(req.user!), res);
	},

	async getMessages(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await internalMessagingService.getMessages(param(req, "id"), req.user!, req.query as Record<string, unknown>),
			res,
		);
	},

	/** Existing-conversation send — :id is a real conversation the caller belongs to. */
	async sendMessage(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await internalMessagingService.sendMessage(
				req.user!,
				{ conversationId: param(req, "id") },
				{ body: req.body.body, attachments: req.body.attachments, replyToId: req.body.replyToId },
			),
			res,
		);
	},

	/** Lazy send — no conversation may exist yet; the service finds-or-creates it. */
	async sendLazyMessage(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await internalMessagingService.sendMessage(
				req.user!,
				{ recipientUserId: req.body.recipientUserId },
				{ body: req.body.body, attachments: req.body.attachments, replyToId: req.body.replyToId },
			),
			res,
		);
	},

	async markRead(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await internalMessagingService.markRead(param(req, "id"), req.user!), res);
	},

	async notifyTyping(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		const target: MessageTarget = req.body.conversationId
			? { conversationId: req.body.conversationId }
			: { recipientUserId: req.body.recipientUserId };
		handleServiceResponse(await internalMessagingService.notifyTyping(req.user!, target), res);
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
