import type { Request, Response } from "express";

import { handleServiceResponse } from "@/utils/httpHandlers";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";

export const usersController = {
	// phase.md Phase 3 — these endpoints exist so the UI can render assignment
	// names, not to hand out a directory. VAs get id + name only; emails are
	// never needed client-side here (the profile screen reads the caller's own
	// user object, and the admin user-management page uses /admin/users).
	async listVas(_req: Request, res: Response): Promise<void> {
		// Include admin so the UI can show admin as an assignable user
		const users = await prisma.user.findMany({
			where: { role: { in: ["va", "admin", "super_admin"] } },
			select: { id: true, name: true, role: true },
			orderBy: { name: "asc" },
		});

		handleServiceResponse(ServiceResponse.success("Users retrieved.", users), res);
	},

	/** All users (admin + VAs) — used for activity-log actor filters etc. */
	async list(_req: Request, res: Response): Promise<void> {
		const users = await prisma.user.findMany({
			select: { id: true, name: true, role: true },
			orderBy: { name: "asc" },
		});

		handleServiceResponse(ServiceResponse.success("Users retrieved.", users), res);
	},
};
