import type { Request, Response } from "express";

import { getRequestContext } from "@/lib/audit";
import { handleServiceResponse } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { passwordVaultService } from "./password-vault.service";

function paramId(req: Request): string {
	const id = req.params.id;
	return Array.isArray(id) ? id[0] : id;
}

function requireUser(req: Request, res: Response): boolean {
	if (!req.user) {
		handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
		return false;
	}
	return true;
}

export const passwordVaultController = {
	async listGroups(_req: Request, res: Response): Promise<void> {
		handleServiceResponse(await passwordVaultService.listGroups(), res);
	},

	async createGroup(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await passwordVaultService.createGroup(req.body, req.user!, getRequestContext(req)), res);
	},

	async renameGroup(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await passwordVaultService.renameGroup(paramId(req), req.body, req.user!, getRequestContext(req)),
			res,
		);
	},

	async deleteGroup(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await passwordVaultService.deleteGroup(paramId(req), req.user!, getRequestContext(req)), res);
	},

	async setGroupAccess(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await passwordVaultService.setGroupAccess(paramId(req), req.body, req.user!, getRequestContext(req)),
			res,
		);
	},

	async listEntries(_req: Request, res: Response): Promise<void> {
		handleServiceResponse(await passwordVaultService.listEntries(), res);
	},

	async createEntry(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await passwordVaultService.createEntry(req.body, req.user!, getRequestContext(req)), res);
	},

	async updateEntry(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await passwordVaultService.updateEntry(paramId(req), req.body, req.user!, getRequestContext(req)),
			res,
		);
	},

	async deleteEntry(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await passwordVaultService.deleteEntry(paramId(req), req.user!, getRequestContext(req)), res);
	},

	async setEntryAccess(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await passwordVaultService.setEntryAccess(paramId(req), req.body, req.user!, getRequestContext(req)),
			res,
		);
	},

	async revealEntry(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await passwordVaultService.revealEntry(paramId(req), req.user!, getRequestContext(req)), res);
	},

	async listMyEntries(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(await passwordVaultService.listMyEntries(req.user!), res);
	},

	async revealMyEntry(req: Request, res: Response): Promise<void> {
		if (!requireUser(req, res)) return;
		handleServiceResponse(
			await passwordVaultService.revealMyEntry(paramId(req), req.user!, getRequestContext(req)),
			res,
		);
	},
};
