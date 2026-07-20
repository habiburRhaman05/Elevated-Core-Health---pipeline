import type { Request, Response } from "express";

import { handleServiceResponse } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { patientsService } from "./patients.service";

function paramId(req: Request): string {
	const id = req.params.id;
	return Array.isArray(id) ? id[0] : id;
}

export const patientsController = {
	async list(req: Request, res: Response): Promise<void> {
		const stage = req.query.stage as string | undefined;
		const serviceResponse = await patientsService.list(stage);
		handleServiceResponse(serviceResponse, res);
	},

	async getById(req: Request, res: Response): Promise<void> {
		const serviceResponse = await patientsService.getById(paramId(req));
		handleServiceResponse(serviceResponse, res);
	},

	async moveStage(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.moveStage(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async assign(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.assign(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async toggleChecklist(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.toggleChecklist(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async updateNotes(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.updateNotes(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async flag(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.flag(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async clearFlag(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.clearFlag(paramId(req), req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async deletePatient(req: Request, res: Response): Promise<void> {
		const serviceResponse = await patientsService.deletePatient(paramId(req));
		handleServiceResponse(serviceResponse, res);
	},

	async claim(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.claim(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async listChecklistItems(_req: Request, res: Response): Promise<void> {
		const serviceResponse = await patientsService.listChecklistItems();
		handleServiceResponse(serviceResponse, res);
	},

	async intake(req: Request, res: Response): Promise<void> {
		const serviceResponse = await patientsService.intake(req.body);
		handleServiceResponse(serviceResponse, res);
	},
};
