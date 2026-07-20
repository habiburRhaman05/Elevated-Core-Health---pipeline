import type { NextFunction, Request, Response } from "express";

import type { UserRole } from "@/config/roles";
import { verifyAccessToken } from "@/lib/auth";
import { AppError } from "@/utils/appError";
import { handleServiceResponse } from "@/utils/httpHandlers";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";

const sendError = (err: unknown, res: Response, fallback: AppError): void => {
	const appError = err instanceof AppError ? err : fallback;
	handleServiceResponse(ServiceResponse.failure(appError.message, appError.data, appError.statusCode), res);
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith("Bearer ")) throw AppError.unauthorized();

		const token = authHeader.slice(7);
		const payload = verifyAccessToken(token);

		const user = await prisma.user.findUnique({
			where: { id: payload.userId },
			select: { id: true, name: true, email: true, role: true },
		});

		if (!user) throw AppError.unauthorized();

		req.user = { id: user.id, name: user.name, email: user.email, role: user.role as UserRole };
		next();
	} catch (err) {
		sendError(err, res, AppError.unauthorized());
	}
};

export const requireRole =
	(...roles: UserRole[]) =>
	(req: Request, res: Response, next: NextFunction): void => {
		if (!req.user) {
			sendError(null, res, AppError.unauthorized());
			return;
		}
		if (!roles.includes(req.user.role)) {
			sendError(null, res, AppError.forbidden("You do not have permission to perform this action"));
			return;
		}
		next();
	};
