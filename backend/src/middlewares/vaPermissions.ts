import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import type { VaPermissionKey } from "@/config/vaPermissions";
import { isAdminOrAbove, type UserRole } from "@/config/roles";
import { handleServiceResponse } from "@/utils/httpHandlers";
import { logger } from "@/utils/logger";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";

/**
 * NOTE ON A SIMILARLY-NAMED SYSTEM: `@/middlewares/authorize.ts` also exports
 * a `requirePermission`, built earlier and not yet wired to any route. That
 * one is a ROLE-level matrix (§17) — the same for every VA. This file is a
 * PER-INDIVIDUAL-VA layer underneath it — Jude and Amanda, both "va", can be
 * granted different things. The two are complementary (a route could
 * eventually check both), not competing, hence the different name
 * (`requireVaPermission`) to keep them from being confused for each other.
 *
 * Resolves whether a user currently holds a given permission.
 *
 * DEFAULT DIRECTION: no row for (userId, key) means GRANTED. See
 * UserPermission's doc comment in schema.prisma for why this is deliberate —
 * flipping it would silently lock out every VA from everything the moment
 * this feature ships.
 *
 * admin/super_admin always return true without a query — this table only
 * ever restricts VAs, never expands or restricts admin authority.
 */
export async function hasPermission(userId: string, role: UserRole, key: VaPermissionKey): Promise<boolean> {
	if (isAdminOrAbove(role)) return true;

	const row = await prisma.userPermission.findUnique({
		where: { userId_permissionKey: { userId, permissionKey: key } },
		select: { granted: true },
	});
	return row?.granted ?? true;
}

/**
 * Route guard mirroring `requireRole` — mount AFTER `requireAuth` (needs
 * `req.user`) on any mutating patient-workflow route this permission covers.
 * Never the only gate on a route: this narrows what a VA can do within a role
 * they already hold, it never substitutes for `requireAuth`/`requireRole`.
 */
export const requireVaPermission =
	(key: VaPermissionKey) =>
	async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		if (!req.user) {
			handleServiceResponse(ServiceResponse.failure("Not authenticated", null, StatusCodes.UNAUTHORIZED), res);
			return;
		}

		try {
			const allowed = await hasPermission(req.user.id, req.user.role, key);
			if (!allowed) {
				logger.info({ userId: req.user.id, permissionKey: key, path: req.path }, "Permission denied");
				handleServiceResponse(
					ServiceResponse.failure(
						"You don't have permission to do that. Contact an admin if you believe this is a mistake.",
						null,
						StatusCodes.FORBIDDEN,
					),
					res,
				);
				return;
			}
			next();
		} catch (err) {
			logger.error({ err, permissionKey: key }, "requirePermission check failed");
			handleServiceResponse(
				ServiceResponse.failure("Something went wrong checking permissions.", null, StatusCodes.INTERNAL_SERVER_ERROR),
				res,
			);
		}
	};
