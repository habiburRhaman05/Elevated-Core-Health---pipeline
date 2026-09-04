import { z } from "zod";

import { VA_PERMISSION_KEYS } from "@/config/vaPermissions";

const permissionKeySchema = z.enum(VA_PERMISSION_KEYS);

export const UpdateVaPermissionsSchema = z.object({
	body: z.object({
		grants: z
			.array(
				z.object({
					key: permissionKeySchema,
					granted: z.boolean(),
				}),
			)
			.min(1, "At least one grant is required"),
	}),
});

export type UpdateVaPermissionsInput = z.infer<typeof UpdateVaPermissionsSchema>["body"];
