import { StatusCodes } from "http-status-codes";

import { VA_PERMISSION_CATALOG, VA_PERMISSION_KEYS, type VaPermissionKey } from "@/config/vaPermissions";
import { audit } from "@/lib/audit";
import type { AuthenticatedUser } from "@/lib/types";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";
import type { UpdateVaPermissionsInput } from "./va-permissions.validation";

export interface VaPermissionView {
	key: VaPermissionKey;
	label: string;
	description: string;
	group: string;
	/** True unless an explicit row denies it — see UserPermission's default-direction doc comment. */
	granted: boolean;
}

export const vaPermissionsService = {
	/**
	 * Full catalog for one user, with every key's current effective grant
	 * filled in (defaulting to true where no row exists) — what both the
	 * vault UI and a VA's own "am I allowed to do X" check read from.
	 */
	async getForUser(userId: string) {
		const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
		if (!user) {
			return ServiceResponse.failure("User not found.", null, StatusCodes.NOT_FOUND);
		}

		const rows = await prisma.userPermission.findMany({ where: { userId } });
		const rowByKey = new Map(rows.map((r) => [r.permissionKey, r.granted]));

		const permissions: VaPermissionView[] = VA_PERMISSION_CATALOG.map((meta) => ({
			key: meta.key,
			label: meta.label,
			description: meta.description,
			group: meta.group,
			granted: rowByKey.get(meta.key) ?? true,
		}));

		return ServiceResponse.success("Permissions retrieved.", { user, permissions });
	},

	/**
	 * A user's own effective permission map, keyed for cheap client-side
	 * lookup (`permissions["patient.stage.update"]`) — what the frontend uses
	 * to hide/disable buttons a VA isn't allowed to use. admin/super_admin
	 * always get every key granted, matching hasPermission()'s bypass.
	 */
	async getEffectiveMap(user: AuthenticatedUser): Promise<Record<VaPermissionKey, boolean>> {
		const isAdmin = user.role === "admin" || user.role === "super_admin";
		const map = {} as Record<VaPermissionKey, boolean>;

		if (isAdmin) {
			for (const key of VA_PERMISSION_KEYS) map[key] = true;
			return map;
		}

		const rows = await prisma.userPermission.findMany({ where: { userId: user.id } });
		const rowByKey = new Map(rows.map((r) => [r.permissionKey, r.granted]));
		for (const key of VA_PERMISSION_KEYS) map[key] = rowByKey.get(key) ?? true;
		return map;
	},

	/**
	 * Bulk grant/revoke for one VA. Upserts each key individually (not a
	 * delete-then-recreate) so a permission never has a moment of "no row"
	 * mid-request that a concurrent read could observe as "granted" when the
	 * admin's intent was to revoke it.
	 */
	async updateForUser(userId: string, input: UpdateVaPermissionsInput, actor: AuthenticatedUser) {
		const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
		if (!user) {
			return ServiceResponse.failure("User not found.", null, StatusCodes.NOT_FOUND);
		}
		if (user.role !== "va") {
			return ServiceResponse.failure(
				"Permissions can only be set for VA accounts — admins already have full access.",
				null,
				StatusCodes.BAD_REQUEST,
			);
		}

		const before = await prisma.userPermission.findMany({ where: { userId } });
		const beforeByKey = new Map(before.map((r) => [r.permissionKey, r.granted]));

		for (const grant of input.grants) {
			await prisma.userPermission.upsert({
				where: { userId_permissionKey: { userId, permissionKey: grant.key } },
				create: { userId, permissionKey: grant.key, granted: grant.granted, updatedById: actor.id },
				update: { granted: grant.granted, updatedById: actor.id },
			});
		}

		const changed = input.grants.filter((g) => (beforeByKey.get(g.key) ?? true) !== g.granted);
		if (changed.length > 0) {
			await audit({
				user: actor,
				action: "user.permissions.update",
				entityType: "user",
				entityId: userId,
				prevValue: Object.fromEntries(changed.map((g) => [g.key, beforeByKey.get(g.key) ?? true])),
				newValue: Object.fromEntries(changed.map((g) => [g.key, g.granted])),
				message: `${actor.name} updated ${user.name}'s permissions: ${changed
					.map((g) => `${g.key} → ${g.granted ? "granted" : "revoked"}`)
					.join(", ")}`,
				type: "manual",
				category: "user_management",
			});
		}

		return vaPermissionsService.getForUser(userId);
	},
};
