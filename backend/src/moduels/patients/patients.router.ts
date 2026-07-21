import { Router } from "express";

import { requireAuth, requireRole } from "@/middlewares/auth";
import { env } from "@/utils/envConfig";
import { handleServiceResponse, validateRequest } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { patientsController } from "./patients.controller";
import {
	AssignSchema,
	ChecklistToggleSchema,
	ClaimSchema,
	ClearFlagSchema,
	FlagSchema,
	IntakeSchema,
	NotesSchema,
	StageMoveSchema,
} from "./patients.validation";

export const patientsRouter: Router = Router();
export const patientsPublicRouter: Router = Router();

// Webhook intake — uses shared secret, not user auth. Mounted at different path.
patientsPublicRouter.post(
	"/intake",
	(req, res, next) => {
		const secret = req.headers["x-webhook-secret"];
		if (!secret || secret !== env.WEBHOOK_SECRET) {
			handleServiceResponse(ServiceResponse.failure("Invalid webhook secret.", null, 401), res);
			return;
		}
		next();
	},
	validateRequest(IntakeSchema),
	patientsController.intake,
);

// All other patient routes require JWT auth
patientsRouter.use(requireAuth);

patientsRouter.get("/", patientsController.list);
patientsRouter.get("/checklist-items", patientsController.listChecklistItems);
patientsRouter.get("/:id", patientsController.getById);
patientsRouter.patch("/:id/stage", validateRequest(StageMoveSchema), patientsController.moveStage);
patientsRouter.patch("/:id/assign", validateRequest(AssignSchema), patientsController.assign);
patientsRouter.patch("/:id/checklist", validateRequest(ChecklistToggleSchema), patientsController.toggleChecklist);
patientsRouter.post("/:id/notes", validateRequest(NotesSchema), patientsController.updateNotes);
patientsRouter.post("/:id/flag", validateRequest(FlagSchema), patientsController.flag);
patientsRouter.patch("/:id/flag/clear", requireRole("admin"), validateRequest(ClearFlagSchema), patientsController.clearFlag);
patientsRouter.delete("/:id", requireRole("admin"), patientsController.deletePatient);
patientsRouter.post("/:id/claim", validateRequest(ClaimSchema), patientsController.claim);

// Frontend test endpoint — simulates webhook intake (requires auth, not webhook secret)
patientsRouter.post("/intake-test", validateRequest(IntakeSchema), patientsController.intake);
