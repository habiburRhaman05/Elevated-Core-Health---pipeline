import crypto from "node:crypto";
import { StatusCodes } from "http-status-codes";

import { comparePassword, hashPassword, signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/auth";
import type { AuthenticatedUser } from "@/lib/types";
import { logger } from "@/utils/logger";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";
import type {
	ChangePasswordInput,
	ForgotPasswordInput,
	LoginInput,
	RefreshInput,
	ResetPasswordInput,
	UpdateProfileInput,
} from "./auth.validation";

function toAuthenticatedUser(user: { id: string; name: string; email: string; role: string }): AuthenticatedUser {
	return { id: user.id, name: user.name, email: user.email, role: user.role as "admin" | "va" };
}

interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

async function createTokens(userId: string, role: string): Promise<AuthTokens> {
	const tokenId = crypto.randomUUID();
	const refreshToken = signRefreshToken(userId, tokenId);
	const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

	await prisma.refreshToken.create({
		data: {
			tokenHash,
			userId,
			expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		},
	});

	return {
		accessToken: signAccessToken(userId, role),
		refreshToken,
	};
}

export const authService = {
	async login(input: LoginInput): Promise<ServiceResponse<{ user: AuthenticatedUser; tokens: AuthTokens } | null>> {
		const user = await prisma.user.findUnique({ where: { email: input.email } });
		if (!user) {
			return ServiceResponse.failure("Invalid email or password.", null, StatusCodes.UNAUTHORIZED);
		}

		const valid = await comparePassword(input.password, user.passwordHash);
		if (!valid) {
			return ServiceResponse.failure("Invalid email or password.", null, StatusCodes.UNAUTHORIZED);
		}

		const tokens = await createTokens(user.id, user.role);

		return ServiceResponse.success("Signed in successfully.", {
			user: toAuthenticatedUser(user),
			tokens,
		});
	},

	async refresh(input: RefreshInput): Promise<ServiceResponse<AuthTokens | null>> {
		try {
			const payload = verifyRefreshToken(input.refreshToken);
			const tokenHash = crypto.createHash("sha256").update(input.refreshToken).digest("hex");

			const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
			if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
				return ServiceResponse.failure("Invalid or expired refresh token.", null, StatusCodes.UNAUTHORIZED);
			}

			await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

			const user = await prisma.user.findUnique({ where: { id: payload.userId } });
			if (!user) {
				return ServiceResponse.failure("User not found.", null, StatusCodes.UNAUTHORIZED);
			}

			const tokens = await createTokens(user.id, user.role);
			return ServiceResponse.success("Tokens refreshed.", tokens);
		} catch (err) {
			logger.error({ err }, "Refresh token verification failed");
			return ServiceResponse.failure("Invalid or expired refresh token.", null, StatusCodes.UNAUTHORIZED);
		}
	},

	async me(userId: string): Promise<ServiceResponse<AuthenticatedUser | null>> {
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) {
			return ServiceResponse.failure("User not found.", null, StatusCodes.NOT_FOUND);
		}
		return ServiceResponse.success("Current user.", toAuthenticatedUser(user));
	},

	async updateProfile(userId: string, input: UpdateProfileInput): Promise<ServiceResponse<AuthenticatedUser | null>> {
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) {
			return ServiceResponse.failure("User not found.", null, StatusCodes.NOT_FOUND);
		}

		const data: Record<string, unknown> = {};
		if (input.name !== undefined) data.name = input.name;
		if (input.email !== undefined) {
			const existing = await prisma.user.findUnique({ where: { email: input.email } });
			if (existing && existing.id !== userId) {
				return ServiceResponse.failure("Email is already in use.", null, StatusCodes.CONFLICT);
			}
			data.email = input.email;
		}

		if (Object.keys(data).length === 0) {
			return ServiceResponse.success("No changes made.", toAuthenticatedUser(user));
		}

		const updated = await prisma.user.update({
			where: { id: userId },
			data,
		});

		return ServiceResponse.success("Profile updated.", toAuthenticatedUser(updated));
	},

	async changePassword(userId: string, input: ChangePasswordInput): Promise<ServiceResponse<null>> {
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) {
			return ServiceResponse.failure("User not found.", null, StatusCodes.NOT_FOUND);
		}

		const valid = await comparePassword(input.currentPassword, user.passwordHash);
		if (!valid) {
			return ServiceResponse.failure("Current password is incorrect.", null, StatusCodes.BAD_REQUEST);
		}

		const passwordHash = await hashPassword(input.newPassword);
		await prisma.user.update({
			where: { id: userId },
			data: { passwordHash },
		});

		return ServiceResponse.success("Password changed successfully.", null);
	},

	async forgotPassword(input: ForgotPasswordInput): Promise<ServiceResponse<null>> {
		const user = await prisma.user.findUnique({ where: { email: input.email } });
		if (!user) {
			return ServiceResponse.success("If this email exists, a reset link has been sent.", null);
		}

		const resetToken = crypto.randomBytes(32).toString("hex");
		const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

		await prisma.user.update({
			where: { id: user.id },
			data: { passwordResetToken: resetToken, passwordResetExpires: resetExpires },
		});

		logger.info({ resetToken, email: user.email }, "Password reset token generated");
		return ServiceResponse.success("If this email exists, a reset link has been sent.", null);
	},

	async resetPassword(input: ResetPasswordInput): Promise<ServiceResponse<null>> {
		const user = await prisma.user.findFirst({
			where: {
				passwordResetToken: input.token,
				passwordResetExpires: { gt: new Date() },
			},
		});

		if (!user) {
			return ServiceResponse.failure("Invalid or expired reset token.", null, StatusCodes.BAD_REQUEST);
		}

		const passwordHash = await hashPassword(input.newPassword);
		await prisma.user.update({
			where: { id: user.id },
			data: { passwordHash, passwordResetToken: null, passwordResetExpires: null },
		});

		await prisma.refreshToken.updateMany({
			where: { userId: user.id, revokedAt: null },
			data: { revokedAt: new Date() },
		});

		return ServiceResponse.success("Password reset successfully.", null);
	},

	async logout(refreshToken: string): Promise<ServiceResponse<null>> {
		const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

		await prisma.refreshToken.updateMany({
			where: { tokenHash, revokedAt: null },
			data: { revokedAt: new Date() },
		});

		return ServiceResponse.success("Signed out successfully.", null);
	},
};
