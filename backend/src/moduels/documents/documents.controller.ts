import type { Request, Response } from "express";

import { handleServiceResponse } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { documentsService } from "./documents.service";

function paramId(req: Request): string {
	const id = req.params.id;
	return Array.isArray(id) ? id[0] : id;
}

function queryStr(req: Request, key: string): string | undefined {
	const v = req.query[key];
	if (typeof v === "string" && v.length > 0) return v;
	return undefined;
}

export const documentsController = {
	async listFolders(req: Request, res: Response): Promise<void> {
		const serviceResponse = await documentsService.listFolders(queryStr(req, "parentId"));
		handleServiceResponse(serviceResponse, res);
	},

	async createFolder(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await documentsService.createFolder(req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async renameFolder(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await documentsService.renameFolder(paramId(req), req.body.name, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async deleteFolder(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const force = req.query.force === "true";
		const serviceResponse = await documentsService.deleteFolder(paramId(req), force, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async list(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await documentsService.list(
			{
				folderId: queryStr(req, "folderId"),
				patientId: queryStr(req, "patientId"),
				search: queryStr(req, "search"),
				type: queryStr(req, "type"),
			},
			req.user,
		);
		handleServiceResponse(serviceResponse, res);
	},

	async upload(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		if (!req.file) {
			handleServiceResponse(ServiceResponse.failure("No file was uploaded.", null, 400), res);
			return;
		}
		const serviceResponse = await documentsService.upload(req.file, req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async update(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await documentsService.update(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async delete(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await documentsService.delete(paramId(req), req.user);
		handleServiceResponse(serviceResponse, res);
	},
};
