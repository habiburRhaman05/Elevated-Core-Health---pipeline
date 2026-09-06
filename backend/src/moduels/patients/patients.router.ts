import { Router } from "express";

import { requireAuth, requireRole } from "@/middlewares/auth";
import { requireCronSecret } from "@/middlewares/cronAuth";
import { requireKlarityToken } from "@/middlewares/klarityAuth";
import { requireVaPermission } from "@/middlewares/vaPermissions";
import { handleServiceResponse, validateRequest } from "@/utils/httpHandlers";
import { ServiceResponse } from "@/utils/serviceResponse";
import { webhookPayloadLogger } from "@/utils/webhookLogger";
import { webhooksService } from "../webhooks/webhooks.service";
import { patientsController } from "./patients.controller";
import {
	AssignSchema,
	CheckEligibilitySchema,
	ChecklistToggleSchema,
	ClaimSchema,
	ClearFlagSchema,
	CreatePatientSchema,
	DeleteNoteSchema,
	FlagSchema,
	IntakeSchema,
	KlarityIntakeSchema,
	NotesSchema,
	StageMoveSchema,
	UpdateAppointmentSchema,
	UpdatePatientSchema,
	UpdateStatusSchema,
} from "./patients.validation";

export const patientsRouter: Router = Router();
export const patientsPublicRouter: Router = Router();

// Webhook intake — uses shared secret, not user auth. Mounted at different path.
// The secret is DB-backed (rotatable from Admin → Settings → Webhooks) and
// falls back to the static WEBHOOK_SECRET env var until the first rotation —
// see webhooksService.getActiveSecret().
//
// webhookPayloadLogger runs FIRST, before the opm-flattening below, so
// `logs/webhooks/` always holds the payload exactly as Optimantra/Make.com
// sent it on the wire — not our own normalized version of it. It also logs
// the response, and runs before validation so even a rejected request is
// captured (see its own doc comment in @/utils/webhookLogger).
patientsPublicRouter.post(
	"/intake",
	webhookPayloadLogger("optimantra"),
	(req, _res, next) => {
		const body = req.body;
		if (body && typeof body === "object") {
			// Case 1: Body is { opm: { firstName, lastName, ... }, email, status, ... }
			// The `opm` key holds the primary patient data from Klarity/Optimantra.
			if (body.opm && typeof body.opm === "object") {
				const merged = { ...body.opm };
				// Top-level fields override opm fields when both exist
				for (const key of Object.keys(body)) {
					if (key !== "opm" && body[key] !== undefined && body[key] !== null && body[key] !== "") {
						merged[key] = body[key];
					}
				}
				req.body = merged;
			}
		}
		next();
	},
	validateRequest(IntakeSchema),
	patientsController.intake,
);

// Klarity appointment webhook. Unlike /intake (shared secret header) this one
// is authenticated with a static bearer token on the Authorization header, and
// takes Klarity's nested envelope shape rather than a flat body.
//
// webhookPayloadLogger runs before requireKlarityToken so a request is logged
// (and thus auditable/debuggable) even when auth or validation rejects it —
// this is also what let us read the exact raw `startAt` string Klarity sent,
// settling whether it was truly UTC or local-time-with-a-Z appended.
patientsPublicRouter.post(
	"/intake/klarity",
	webhookPayloadLogger("klarity"),
	requireKlarityToken,
	validateRequest(KlarityIntakeSchema),
	patientsController.intakeKlarity,
);

// Grow Therapy calendar sync — poll-based, not a vendor push. Vercel Cron
// (production) hits this with GET on the configured schedule (see
// vercel.json); POST is kept for a manual admin trigger / curl test with
// ?dryRun=true. Auth is requireCronSecret, not requireKlarityToken/a webhook
// secret — see that middleware's doc comment for why.
patientsPublicRouter.get("/intake/grow-therapy", patientsController.syncGrowTherapy);
patientsPublicRouter.post("/intake/grow-therapy", patientsController.syncGrowTherapy);

// All other patient routes require JWT auth
patientsRouter.use(requireAuth);

patientsRouter.get("/", patientsController.list);
// Manual create — authenticated user is recorded as the audit author.
patientsRouter.post("/", validateRequest(CreatePatientSchema), patientsController.create);
patientsRouter.get("/checklist-items", patientsController.listChecklistItems);
patientsRouter.get("/:id", patientsController.getById);
patientsRouter.get("/:id/appointment-history", patientsController.getAppointmentHistory);
patientsRouter.patch(
	"/:id/stage",
	requireVaPermission("patient.stage.update"),
	validateRequest(StageMoveSchema),
	patientsController.moveStage,
);
// Reassigning a patient to an arbitrary user is admin/super_admin only (task.md §17: "Reassign patients" — VA: No).
// A VA claiming an unassigned patient for themselves is a separate, narrower action — see POST /:id/claim below.
patientsRouter.patch("/:id/assign", requireRole("admin"), validateRequest(AssignSchema), patientsController.assign);
patientsRouter.patch(
	"/:id",
	requireVaPermission("patient.info.update"),
	validateRequest(UpdatePatientSchema),
	patientsController.updatePatient,
);
patientsRouter.post("/:id/lock", patientsController.lockPatient);
patientsRouter.post("/:id/unlock", patientsController.unlockPatient);
patientsRouter.patch(
	"/:id/status",
	requireRole("admin"),
	validateRequest(UpdateStatusSchema),
	patientsController.updateStatus,
);
patientsRouter.patch(
	"/:id/checklist",
	requireVaPermission("patient.checklist.update"),
	validateRequest(ChecklistToggleSchema),
	patientsController.toggleChecklist,
);
patientsRouter.post(
	"/:id/notes",
	requireVaPermission("patient.notes.manage"),
	validateRequest(NotesSchema),
	patientsController.createNote,
);
patientsRouter.delete(
	"/:id/notes/:noteId",
	requireVaPermission("patient.notes.manage"),
	validateRequest(DeleteNoteSchema),
	patientsController.deleteNote,
);
patientsRouter.patch(
	"/:id/appointment",
	requireVaPermission("patient.appointment.update"),
	validateRequest(UpdateAppointmentSchema),
	patientsController.updateAppointment,
);
patientsRouter.post(
	"/:id/flag",
	requireVaPermission("patient.flag.raise"),
	validateRequest(FlagSchema),
	patientsController.flag,
);
patientsRouter.post(
	"/:id/check-eligibility",
	validateRequest(CheckEligibilitySchema),
	patientsController.checkEligibility,
);
patientsRouter.patch(
	"/:id/flag/clear",
	requireRole("admin"),
	validateRequest(ClearFlagSchema),
	patientsController.clearFlag,
);
patientsRouter.delete("/:id", requireRole("admin"), patientsController.deletePatient);
patientsRouter.post("/:id/claim", validateRequest(ClaimSchema), patientsController.claim);

// Frontend test endpoint — simulates webhook intake (requires auth, not webhook secret)
patientsRouter.post("/intake-test", validateRequest(IntakeSchema), patientsController.intake);
