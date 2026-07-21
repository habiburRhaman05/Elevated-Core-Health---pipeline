import type { Request, Response } from "express";

import { handleServiceResponse } from "@/utils/httpHandlers";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";

export const usersController = {
	async listVas(_req: Request, res: Response): Promise<void> {
		const vas = await prisma.user.findMany({
			where: { role: "va" },
			select: { id: true, name: true, email: true },
			orderBy: { name: "asc" },
		});

		handleServiceResponse(ServiceResponse.success("VA users retrieved.", vas), res);
	},
};
