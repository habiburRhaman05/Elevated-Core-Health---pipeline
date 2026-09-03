/**
 * Verification harness for the per-VA permission vault (Feature 1).
 * Exercises the real database and the real Express app (via supertest).
 * Run: npx tsx scripts/verify-va-permissions.ts
 *
 * Uses "test user (developer)" (a real, throwaway VA account already in the
 * DB) so nothing touches Jude/Alie/Yasir's actual grants. Deletes every
 * UserPermission row it creates at the end, restoring that account to its
 * default (no overrides) state.
 */
import jwt from "jsonwebtoken";
import request from "supertest";

import { hasPermission } from "@/middlewares/vaPermissions";
import { vaPermissionsService } from "@/moduels/va-permissions/va-permissions.service";
import { app } from "@/server";
import { env } from "@/utils/envConfig";
import { prisma } from "@/utils/prisma";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
	if (ok) {
		pass++;
		console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
	} else {
		fail++;
		console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
	}
}

function tokenFor(userId: string, role: string): string {
	return jwt.sign({ userId, role }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

async function main() {
	const testVa = await prisma.user.findFirst({ where: { name: "test user (developer)" }, select: { id: true, name: true, role: true } });
	const donna = await prisma.user.findFirst({ where: { role: "super_admin" }, select: { id: true, name: true } });
	if (!testVa || !donna) throw new Error("Expected 'test user (developer)' (va) and a super_admin to exist");

	const vaToken = tokenFor(testVa.id, testVa.role);
	const adminToken = tokenFor(donna.id, "super_admin");

	console.log(`\nUsing VA: ${testVa.name} (${testVa.id})`);
	console.log(`Using admin: ${donna.name} (${donna.id})\n`);

	console.log("=== 1. Default direction: no rows yet -> everything granted ===");
	const defaultGranted = await hasPermission(testVa.id, "va", "patient.stage.update");
	check("hasPermission() with no UserPermission rows -> true (opt-out default)", defaultGranted === true);

	console.log("\n=== 2. Admin/super_admin always bypass, regardless of rows ===");
	const adminBypass = await hasPermission(donna.id, "super_admin", "patient.stage.update");
	check("hasPermission() for super_admin -> true unconditionally", adminBypass === true);

	console.log("\n=== 3. GET /admin/permissions/:userId (admin) — full catalog with defaults filled in ===");
	const getResp = await request(app)
		.get(`/api/admin/permissions/${testVa.id}`)
		.set("Authorization", `Bearer ${adminToken}`);
	check("200 OK", getResp.status === 200, getResp.body?.message);
	check("returns 8 permissions, all granted by default", getResp.body?.data?.permissions?.length === 8 && getResp.body.data.permissions.every((p: any) => p.granted === true));

	console.log("\n=== 4. VA cannot view/edit another user's permissions (admin-only route) ===");
	const vaBlocked = await request(app)
		.get(`/api/admin/permissions/${testVa.id}`)
		.set("Authorization", `Bearer ${vaToken}`);
	check("VA calling admin route -> 403", vaBlocked.status === 403, vaBlocked.body?.message);

	console.log("\n=== 5. Admin revokes patient.stage.update for the VA ===");
	const patchResp = await request(app)
		.patch(`/api/admin/permissions/${testVa.id}`)
		.set("Authorization", `Bearer ${adminToken}`)
		.send({ grants: [{ key: "patient.stage.update", granted: false }] });
	check("200 OK", patchResp.status === 200, patchResp.body?.message);
	const updatedPerm = patchResp.body?.data?.permissions?.find((p: any) => p.key === "patient.stage.update");
	check("that key now shows granted:false in the response", updatedPerm?.granted === false);

	console.log("\n=== 6. hasPermission() now reflects the revoke ===");
	const revoked = await hasPermission(testVa.id, "va", "patient.stage.update");
	check("hasPermission() -> false after revoke", revoked === false);
	const otherStillGranted = await hasPermission(testVa.id, "va", "patient.notes.manage");
	check("a DIFFERENT, untouched key is still granted (no over-broad revoke)", otherStillGranted === true);

	console.log("\n=== 7. requireVaPermission actually blocks the real stage-move route ===");
	// Fetch a real patient to attempt the move against (any patient works;
	// only the permission gate itself is under test — never reaching the
	// service is exactly the point of the check).
	const anyPatient = await prisma.patient.findFirst({ select: { id: true } });
	if (anyPatient) {
		const blockedMove = await request(app)
			.patch(`/api/patients/${anyPatient.id}/stage`)
			.set("Authorization", `Bearer ${vaToken}`)
			.send({ targetStage: "visit_complete" });
		check("stage move blocked with revoked permission -> 403", blockedMove.status === 403, blockedMove.body?.message);
	} else {
		console.log("  (skipped — no patients in DB to test against)");
	}

	console.log("\n=== 8. Admin re-grants it ===");
	const regrantResp = await request(app)
		.patch(`/api/admin/permissions/${testVa.id}`)
		.set("Authorization", `Bearer ${adminToken}`)
		.send({ grants: [{ key: "patient.stage.update", granted: true }] });
	check("200 OK", regrantResp.status === 200);
	const regranted = await hasPermission(testVa.id, "va", "patient.stage.update");
	check("hasPermission() -> true again after re-grant", regranted === true);

	console.log("\n=== 9. Audit trail written for the permission changes ===");
	const auditRows = await prisma.activityLog.findMany({
		where: { action: "user.permissions.update", entityId: testVa.id },
		orderBy: { createdAt: "desc" },
		take: 5,
	});
	check("at least 2 audit rows exist (revoke + re-grant)", auditRows.length >= 2, `found ${auditRows.length}`);
	check("category = user_management", auditRows[0]?.category === "user_management");

	console.log("\n=== 10. GET /users/me/permissions — the frontend's own lookup ===");
	const meVa = await request(app).get("/api/users/me/permissions").set("Authorization", `Bearer ${vaToken}`);
	check("VA's own map -> 200, has all 8 keys", meVa.status === 200 && Object.keys(meVa.body?.data ?? {}).length === 8);
	const meAdmin = await request(app).get("/api/users/me/permissions").set("Authorization", `Bearer ${adminToken}`);
	check("admin's own map -> every key true", meAdmin.status === 200 && Object.values(meAdmin.body?.data ?? {}).every((v) => v === true));

	console.log("\n=== 11. Cannot set permissions on an admin account (va-only target) ===");
	const adminTargetResp = await request(app)
		.patch(`/api/admin/permissions/${donna.id}`)
		.set("Authorization", `Bearer ${adminToken}`)
		.send({ grants: [{ key: "patient.stage.update", granted: false }] });
	check("400 — admins don't get restricted", adminTargetResp.status === 400, adminTargetResp.body?.message);

	console.log("\n=== 12. Validation rejects an unknown permission key ===");
	const badKeyResp = await request(app)
		.patch(`/api/admin/permissions/${testVa.id}`)
		.set("Authorization", `Bearer ${adminToken}`)
		.send({ grants: [{ key: "patient.delete_everything", granted: false }] });
	check("400 for an invalid key", badKeyResp.status === 400, badKeyResp.body?.message);

	// cleanup — restore the test VA to zero overrides (default state)
	const deleted = await prisma.userPermission.deleteMany({ where: { userId: testVa.id } });
	console.log(`\n  (cleaned up ${deleted.count} test permission row(s) — account restored to defaults)`);

	console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
	await prisma.$disconnect();
	process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
	console.error("HARNESS ERROR:", e);
	await prisma.$disconnect();
	process.exit(1);
});
