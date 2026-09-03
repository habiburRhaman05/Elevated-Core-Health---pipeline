import type { Request, Response } from "express";

import { handleServiceResponse } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { vaPermissionsService } from "./va-permissions.service";

function paramUserId(req: Request): string {
	const id = req.params.userId;
	return Array.isArray(id) ? id[0] : id;
}

export const vaPermissionsController = {
	async getForUser(req: Request, res: Response): Promise<void> {
		const serviceResponse = await vaPermissionsService.getForUser(paramUserId(req));
		handleServiceResponse(serviceResponse, res);
	},

	async updateForUser(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await vaPermissionsService.updateForUser(paramUserId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async getMine(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const map = await vaPermissionsService.getEffectiveMap(req.user);
		handleServiceResponse(ServiceResponse.success("Effective permissions retrieved.", map), res);
	},
};
