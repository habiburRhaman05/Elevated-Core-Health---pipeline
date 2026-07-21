import { Router } from "express";

import { requireAuth } from "@/middlewares/auth";
import { usersController } from "./users.controller";

export const usersRouter: Router = Router();

usersRouter.get("/vas", requireAuth, usersController.listVas);
