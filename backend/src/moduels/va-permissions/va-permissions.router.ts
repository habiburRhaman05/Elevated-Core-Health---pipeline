import { Router } from "express";

import { requireAuth, requireRole } from "@/middlewares/auth";
import { validateRequest } from "@/utils/httpHandlers";
import { vaPermissionsController } from "./va-permissions.controller";
import { UpdateVaPermissionsSchema } from "./va-permissions.validation";

export const vaPermissionsRouter: Router = Router();

vaPermissionsRouter.use(requireAuth);

// Admin-only: view/edit another user's permission grants.
vaPermissionsRouter.get("/:userId", requireRole("admin"), vaPermissionsController.getForUser);
vaPermissionsRouter.patch(
	"/:userId",
	requireRole("admin"),
	validateRequest(UpdateVaPermissionsSchema),
	vaPermissionsController.updateForUser,
);
