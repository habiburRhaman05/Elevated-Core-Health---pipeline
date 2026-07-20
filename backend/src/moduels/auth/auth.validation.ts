import { z } from "zod";

export const LoginSchema = z.object({
	body: z.object({
		email: z.string().trim().toLowerCase().email("A valid email address is required"),
		password: z.string().min(1, "Password is required"),
	}),
});

export const RefreshSchema = z.object({
	body: z.object({
		refreshToken: z.string().min(1, "Refresh token is required"),
	}),
});

export const UpdateProfileSchema = z.object({
	body: z.object({
		name: z.string().trim().min(1, "Name is required").optional(),
		email: z.string().trim().toLowerCase().email("A valid email address is required").optional(),
	}),
});

export const ChangePasswordSchema = z.object({
	body: z.object({
		currentPassword: z.string().min(1, "Current password is required"),
		newPassword: z.string().min(6, "New password must be at least 6 characters"),
	}),
});

export const ForgotPasswordSchema = z.object({
	body: z.object({
		email: z.string().trim().toLowerCase().email("A valid email address is required"),
	}),
});

export const ResetPasswordSchema = z.object({
	body: z.object({
		token: z.string().min(1, "Reset token is required"),
		newPassword: z.string().min(6, "New password must be at least 6 characters"),
	}),
});

export type LoginInput = z.infer<typeof LoginSchema>["body"];
export type RefreshInput = z.infer<typeof RefreshSchema>["body"];
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>["body"];
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>["body"];
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>["body"];
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>["body"];
