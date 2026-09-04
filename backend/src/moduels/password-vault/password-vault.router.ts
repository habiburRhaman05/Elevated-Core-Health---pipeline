import { Router } from "express";

import { requireAuth, requireRole } from "@/middlewares/auth";
import { validateRequest } from "@/utils/httpHandlers";
import { passwordVaultController } from "./password-vault.controller";
import {
	CreateEntrySchema,
	CreateGroupSchema,
	RenameGroupSchema,
	SetEntryAccessSchema,
	SetGroupAccessSchema,
	UpdateEntrySchema,
} from "./password-vault.validation";

export const passwordVaultRouter: Router = Router();

passwordVaultRouter.use(requireAuth);

// VA-facing — any authenticated user, filtered server-side to what they were
// actually granted. Registered before the admin-only routes below so a VA
// hitting /my-entries never falls through to the admin gate.
passwordVaultRouter.get("/my-entries", passwordVaultController.listMyEntries);
passwordVaultRouter.get("/my-entries/:id/reveal", passwordVaultController.revealMyEntry);

// Everything else is admin-only.
passwordVaultRouter.use(requireRole("admin"));

passwordVaultRouter.get("/groups", passwordVaultController.listGroups);
passwordVaultRouter.post("/groups", validateRequest(CreateGroupSchema), passwordVaultController.createGroup);
passwordVaultRouter.patch("/groups/:id", validateRequest(RenameGroupSchema), passwordVaultController.renameGroup);
passwordVaultRouter.delete("/groups/:id", passwordVaultController.deleteGroup);
passwordVaultRouter.patch(
	"/groups/:id/access",
	validateRequest(SetGroupAccessSchema),
	passwordVaultController.setGroupAccess,
);

passwordVaultRouter.get("/entries", passwordVaultController.listEntries);
passwordVaultRouter.post("/entries", validateRequest(CreateEntrySchema), passwordVaultController.createEntry);
passwordVaultRouter.patch("/entries/:id", validateRequest(UpdateEntrySchema), passwordVaultController.updateEntry);
passwordVaultRouter.delete("/entries/:id", passwordVaultController.deleteEntry);
passwordVaultRouter.patch(
	"/entries/:id/access",
	validateRequest(SetEntryAccessSchema),
	passwordVaultController.setEntryAccess,
);
passwordVaultRouter.get("/entries/:id/reveal", passwordVaultController.revealEntry);
