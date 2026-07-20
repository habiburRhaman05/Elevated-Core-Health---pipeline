import { Router } from "express";

import { requireAuth } from "@/middlewares/auth";
import { validateRequest } from "@/utils/httpHandlers";
import { authController } from "./auth.controller";
import {
	ChangePasswordSchema,
	ForgotPasswordSchema,
	LoginSchema,
	RefreshSchema,
	ResetPasswordSchema,
	UpdateProfileSchema,
} from "./auth.validation";

export const authRouter: Router = Router();

authRouter.post("/login", validateRequest(LoginSchema), authController.login);
authRouter.post("/refresh", validateRequest(RefreshSchema), authController.refresh);
authRouter.get("/me", requireAuth, authController.me);
authRouter.post("/logout", authController.logout);
authRouter.patch("/profile", requireAuth, validateRequest(UpdateProfileSchema), authController.updateProfile);
authRouter.post("/change-password", requireAuth, validateRequest(ChangePasswordSchema), authController.changePassword);
authRouter.post("/forgot-password", validateRequest(ForgotPasswordSchema), authController.forgotPassword);
authRouter.post("/reset-password", validateRequest(ResetPasswordSchema), authController.resetPassword);
