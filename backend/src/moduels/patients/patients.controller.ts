import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { env } from "@/utils/envConfig";
import { handleServiceResponse } from "@/utils/httpHandlers";
import { logger } from "@/utils/logger";
import { ServiceResponse } from "@/utils/serviceResponse";
import { patientsService } from "./patients.service";

function paramId(req: Request): string {
	const id = req.params.id;
	return Array.isArray(id) ? id[0] : id;
}

export const patientsController = {
	async list(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const stage = req.query.stage as string | undefined;
		const serviceResponse = await patientsService.list(stage, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async getById(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.getById(paramId(req), req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async getAppointmentHistory(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.getAppointmentHistory(paramId(req), req.user);
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

	async createNote(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.createNote(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async deleteNote(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const noteId = req.params.noteId;
		const serviceResponse = await patientsService.deleteNote(paramId(req), Array.isArray(noteId) ? noteId[0] : noteId, req.user);
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
		const serviceResponse = await patientsService.clearFlag(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async deletePatient(req: Request, res: Response): Promise<void> {
		const serviceResponse = await patientsService.deletePatient(paramId(req));
		handleServiceResponse(serviceResponse, res);
	},

	async updatePatient(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.updatePatient(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async lockPatient(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.lockPatient(paramId(req), req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async unlockPatient(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.unlockPatient(paramId(req), req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async updateStatus(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.updateStatus(paramId(req), req.body, req.user);
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

	async checkEligibility(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.checkEligibility(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async listChecklistItems(_req: Request, res: Response): Promise<void> {
		const serviceResponse = await patientsService.listChecklistItems();
		handleServiceResponse(serviceResponse, res);
	},

	async intake(req: Request, res: Response): Promise<void> {
		const body = req.body;
		logger.info({ body, path: req.path }, "Webhook intake received");
		
		const serviceResponse = await patientsService.intake(body);
		handleServiceResponse(serviceResponse, res);
	},

	/** Klarity appointment webhook. Auth is the bearer token checked by requireKlarityToken. */
	async intakeKlarity(req: Request, res: Response): Promise<void> {
		logger.info(
			{ eventType: req.body?.eventType, appointmentId: req.body?.appointment?.id, path: req.path },
			"Klarity webhook intake received",
		);
		const serviceResponse = await patientsService.intakeKlarity(req.body);
		handleServiceResponse(serviceResponse, res);
	},

	/**
	 * Grow Therapy calendar sync — triggered by Vercel Cron in production
	 * (GET, auth via requireCronSecret) or manually (GET/POST, e.g. from an
	 * admin settings screen or a curl test). `?dryRun=true` fetches and logs
	 * without writing anything, for safely testing a newly-configured
	 * calendar URL.
	 */
	async syncGrowTherapy(req: Request, res: Response): Promise<void> {
		if (!env.GROW_THERAPY_ICS_URL) {
			handleServiceResponse(
				ServiceResponse.failure(
					"GROW_THERAPY_ICS_URL is not configured. Set it in the environment to enable the Grow Therapy calendar sync.",
					null,
					StatusCodes.NOT_IMPLEMENTED,
				),
				res,
			);
			return;
		}

		const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;
		logger.info({ dryRun }, "Grow Therapy calendar sync — starting");
		const serviceResponse = await patientsService.syncGrowTherapy(env.GROW_THERAPY_ICS_URL, { dryRun });
		handleServiceResponse(serviceResponse, res);
	},

	async create(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.create(req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},

	async updateAppointment(req: Request, res: Response): Promise<void> {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, 401), res);
			return;
		}
		const serviceResponse = await patientsService.updateAppointment(paramId(req), req.body, req.user);
		handleServiceResponse(serviceResponse, res);
	},
};
