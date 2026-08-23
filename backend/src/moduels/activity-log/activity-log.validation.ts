import { z } from "zod";

export const ActivityLogQuerySchema = z.object({
	query: z.object({
		patientId: z.string().optional(),
		type: z.enum(["auto", "manual"]).optional(),
		category: z
			.enum(["auth", "profile", "patient", "appointment", "user_management", "report", "system", "messaging"])
			.optional(),
		author: z.string().optional(),
		actorId: z.string().uuid().optional(),
		role: z.enum(["super_admin", "admin", "va"]).optional(),
		action: z.string().optional(),
		entityType: z.string().optional(),
		entityId: z.string().optional(),
		q: z.string().max(200).optional(),
		startDate: z.string().optional(),
		endDate: z.string().optional(),
		page: z.coerce.number().int().positive().default(1),
		limit: z.coerce.number().int().positive().max(100).default(50),
	}),
});
