import type { Request, Response } from "express";

import { handleServiceResponse } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { authService } from "./auth.service";

export const authController = {
	async login(req: Request, res: Response): Promise<void> {
		const serviceResponse = await authService.login(req.body);
		handleServiceResponse(serviceResponse, res);
	},

	async refresh(req: Request, res: Response): Promise<void> {
		const serviceResponse = await authService.refresh(req.body);
		handleServiceResponse(serviceResponse, res);
	},

	async me(req: Request, res: Response): Promise<void> {
		const userId = req.user?.id;
		if (!userId) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await authService.me(userId);
		handleServiceResponse(serviceResponse, res);
	},

	async updateProfile(req: Request, res: Response): Promise<void> {
		const userId = req.user?.id;
		if (!userId) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await authService.updateProfile(userId, req.body);
		handleServiceResponse(serviceResponse, res);
	},

	async changePassword(req: Request, res: Response): Promise<void> {
		const userId = req.user?.id;
		if (!userId) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await authService.changePassword(userId, req.body);
		handleServiceResponse(serviceResponse, res);
	},

	async forgotPassword(req: Request, res: Response): Promise<void> {
		const serviceResponse = await authService.forgotPassword(req.body);
		handleServiceResponse(serviceResponse, res);
	},

	async resetPassword(req: Request, res: Response): Promise<void> {
		const serviceResponse = await authService.resetPassword(req.body);
		handleServiceResponse(serviceResponse, res);
	},

	async logout(req: Request, res: Response): Promise<void> {
		const refreshToken = req.body?.refreshToken;
		if (!refreshToken) {
			handleServiceResponse(ServiceResponse.success("Signed out successfully.", null), res);
			return;
		}
		const serviceResponse = await authService.logout(refreshToken);
		handleServiceResponse(serviceResponse, res);
	},
};
