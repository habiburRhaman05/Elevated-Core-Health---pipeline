import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { getRequestContext } from "@/lib/audit";
import { handleServiceResponse } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { messagingService } from "./messaging.service";

// Mirrors patients.controller.ts's paramId() — Express types a route param
// as `string | string[]` (repeated-param routes), but none of ours ever
// repeat, so this always normalizes to a single string.
function param(req: Request, name: string): string {
	const value = req.params[name];
	return Array.isArray(value) ? value[0] : value;
}

export const messagingController = {
	async getStatus(_req: Request, res: Response): Promise<void> {
		handleServiceResponse(await messagingService.getStatus(), res);
	},

	async listNumbers(_req: Request, res: Response): Promise<void> {
		handleServiceResponse(await messagingService.listNumbers(), res);
	},

	async listConversations(req: Request, res: Response): Promise<void> {
		const serviceResponse = await messagingService.listConversations(req.query as Record<string, unknown>);
		handleServiceResponse(serviceResponse, res);
	},

	async getConversationByPatient(req: Request, res: Response): Promise<void> {
		const serviceResponse = await messagingService.getConversationByPatientId(param(req, "patientId"));
		handleServiceResponse(serviceResponse, res);
	},

	async getMessages(req: Request, res: Response): Promise<void> {
		const serviceResponse = await messagingService.getMessages(param(req, "id"), req.query as Record<string, unknown>);
		handleServiceResponse(serviceResponse, res);
	},

	async sendMessage(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, StatusCodes.UNAUTHORIZED), res);
			return;
		}
		const serviceResponse = await messagingService.sendMessage(
			param(req, "id"),
			req.body.content,
			req.user,
			getRequestContext(req),
			req.body.phoneNumberId,
		);
		handleServiceResponse(serviceResponse, res);
	},

	async linkPatient(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, StatusCodes.UNAUTHORIZED), res);
			return;
		}
		const serviceResponse = await messagingService.linkConversationToPatient(
			param(req, "id"),
			req.body.patientId,
			req.user,
			getRequestContext(req),
		);
		handleServiceResponse(serviceResponse, res);
	},
	async markRead(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, StatusCodes.UNAUTHORIZED), res);
			return;
		}
		const serviceResponse = await messagingService.markConversationRead(param(req, "id"), req.user);
		handleServiceResponse(serviceResponse, res);
	},
};
