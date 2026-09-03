import { Router } from "express";

import { requireAuth } from "@/middlewares/auth";
import { vaPermissionsController } from "@/moduels/va-permissions/va-permissions.controller";
import { usersController } from "./users.controller";

export const usersRouter: Router = Router();

usersRouter.get("/vas", requireAuth, usersController.listVas);
usersRouter.get("/", requireAuth, usersController.list);
// Any authenticated user's own effective permission map — what the frontend
// reads to hide/disable buttons a VA isn't currently granted.
usersRouter.get("/me/permissions", requireAuth, vaPermissionsController.getMine);
