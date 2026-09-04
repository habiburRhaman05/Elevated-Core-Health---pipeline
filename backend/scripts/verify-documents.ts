/**
 * Verification harness for Document Storage (Feature 2).
 * Exercises the real database, the real Express app, AND real Cloudinary
 * uploads/deletes — this is not mocked. Run: npx tsx scripts/verify-documents.ts
 *
 * Creates two throwaway patients (one assigned to the test VA, one to nobody
 * else's scope) and one throwaway folder/document tree, all deleted at the end.
 */
import jwt from "jsonwebtoken";
import request from "supertest";

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

const RUN_ID = Date.now();
const tinyFileBuffer = Buffer.from("Elevated Core Health - test document content");

async function main() {
	const testVa = await prisma.user.findFirst({ where: { name: "test user (developer)" }, select: { id: true, name: true, role: true } });
	const otherVa = await prisma.user.findFirst({
		where: { role: "va", name: { not: "test user (developer)" } },
		select: { id: true, name: true },
	});
	const donna = await prisma.user.findFirst({ where: { role: "super_admin" }, select: { id: true, name: true } });
	if (!testVa || !otherVa || !donna) throw new Error("Expected test VA, another VA, and a super_admin to exist");

	const vaToken = tokenFor(testVa.id, testVa.role);
	const adminToken = tokenFor(donna.id, "super_admin");

	console.log(`\nTest VA: ${testVa.name} | Other VA: ${otherVa.name} | Admin: ${donna.name}\n`);

	// Throwaway patients for scope testing.
	const myPatient = await prisma.patient.create({
		data: { firstName: `DocTest-${RUN_ID}`, lastName: "MyPatient", stage: "onboarding", assignedTo: testVa.id, source: "manual" },
	});
	const otherPatient = await prisma.patient.create({
		data: { firstName: `DocTest-${RUN_ID}`, lastName: "OtherPatient", stage: "onboarding", assignedTo: otherVa.id, source: "manual" },
	});

	console.log("=== 1. Folder management is admin-only ===");
	const vaCreateFolder = await request(app)
		.post("/api/documents/folders")
		.set("Authorization", `Bearer ${vaToken}`)
		.send({ name: "VA attempt" });
	check("VA cannot create a folder -> 403", vaCreateFolder.status === 403, vaCreateFolder.body?.message);

	const createFolder = await request(app)
		.post("/api/documents/folders")
		.set("Authorization", `Bearer ${adminToken}`)
		.send({ name: `Test Folder ${RUN_ID}` });
	check("admin creates a folder -> 201", createFolder.status === 201, createFolder.body?.message);
	const folderId = createFolder.body?.data?.id;

	console.log("\n=== 2. Folder appears in the root listing ===");
	const listFolders = await request(app).get("/api/documents/folders").set("Authorization", `Bearer ${vaToken}`);
	check("VA CAN list folders (read is not admin-only)", listFolders.status === 200);
	check("new folder present", listFolders.body?.data?.some((f: any) => f.id === folderId));

	console.log("\n=== 3. Upload requires patient.documents.upload permission ===");
	await prisma.userPermission.upsert({
		where: { userId_permissionKey: { userId: testVa.id, permissionKey: "patient.documents.upload" } },
		create: { userId: testVa.id, permissionKey: "patient.documents.upload", granted: false },
		update: { granted: false },
	});
	const blockedUpload = await request(app)
		.post("/api/documents/upload")
		.set("Authorization", `Bearer ${vaToken}`)
		.field("folderId", folderId)
		.attach("file", tinyFileBuffer, "blocked.txt");
	check("upload blocked without permission -> 403", blockedUpload.status === 403, blockedUpload.body?.message);

	await prisma.userPermission.update({
		where: { userId_permissionKey: { userId: testVa.id, permissionKey: "patient.documents.upload" } },
		data: { granted: true },
	});

	console.log("\n=== 4. VA cannot upload a document linked to a patient outside their scope ===");
	const wrongScopeUpload = await request(app)
		.post("/api/documents/upload")
		.set("Authorization", `Bearer ${vaToken}`)
		.field("patientId", otherPatient.id)
		.attach("file", tinyFileBuffer, "wrong-scope.txt");
	check("blocked -> 403", wrongScopeUpload.status === 403, wrongScopeUpload.body?.message);

	console.log("\n=== 5. Real Cloudinary upload — general (unlinked) document into the folder ===");
	const uploadResp = await request(app)
		.post("/api/documents/upload")
		.set("Authorization", `Bearer ${vaToken}`)
		.field("folderId", folderId)
		.attach("file", tinyFileBuffer, "general-doc.txt");
	check("201 Created", uploadResp.status === 201, uploadResp.body?.message);
	const documentId = uploadResp.body?.data?.id;
	const cloudinaryUrl = uploadResp.body?.data?.url;
	check("has a real Cloudinary URL", typeof cloudinaryUrl === "string" && cloudinaryUrl.startsWith("https://res.cloudinary.com/"), cloudinaryUrl);
	check("resourceType = raw for a .txt file", uploadResp.body?.data?.resourceType === "raw");

	console.log("\n=== 6. VA uploads a document linked to THEIR OWN patient ===");
	const myPatientUpload = await request(app)
		.post("/api/documents/upload")
		.set("Authorization", `Bearer ${vaToken}`)
		.field("patientId", myPatient.id)
		.attach("file", tinyFileBuffer, "my-patient-doc.pdf");
	check("201 Created", myPatientUpload.status === 201, myPatientUpload.body?.message);
	const myPatientDocId = myPatientUpload.body?.data?.id;

	console.log("\n=== 7. Listing & search ===");
	const listByFolder = await request(app)
		.get(`/api/documents?folderId=${folderId}`)
		.set("Authorization", `Bearer ${vaToken}`);
	check("folder listing has exactly 1 doc", listByFolder.body?.data?.length === 1, `count=${listByFolder.body?.data?.length}`);

	const searchResp = await request(app)
		.get("/api/documents?search=general-doc")
		.set("Authorization", `Bearer ${vaToken}`);
	check("search finds the file by name", searchResp.body?.data?.some((d: any) => d.id === documentId));

	console.log("\n=== 8. Patient-scope visibility on LISTING (not just upload) ===");
	// otherVa's own token, to check they can't see myPatient's linked doc.
	const otherVaToken = tokenFor(otherVa.id, "va");
	const otherVaList = await request(app).get("/api/documents").set("Authorization", `Bearer ${otherVaToken}`);
	check(
		"a VA outside the patient's scope does NOT see that patient's linked doc",
		!otherVaList.body?.data?.some((d: any) => d.id === myPatientDocId),
	);
	check(
		"but DOES see the general (unlinked) document",
		otherVaList.body?.data?.some((d: any) => d.id === documentId),
	);
	const adminList = await request(app).get("/api/documents").set("Authorization", `Bearer ${adminToken}`);
	check("admin sees everything, including the scoped doc", adminList.body?.data?.some((d: any) => d.id === myPatientDocId));

	console.log("\n=== 9. Rename & move ===");
	const renameResp = await request(app)
		.patch(`/api/documents/${documentId}`)
		.set("Authorization", `Bearer ${adminToken}`)
		.send({ fileName: "renamed-doc.txt" });
	check("renamed -> 200", renameResp.status === 200 && renameResp.body?.data?.fileName === "renamed-doc.txt");

	const moveResp = await request(app)
		.patch(`/api/documents/${documentId}`)
		.set("Authorization", `Bearer ${adminToken}`)
		.send({ folderId: null });
	check("moved to Uncategorized (folderId null) -> 200", moveResp.status === 200 && moveResp.body?.data?.folderId === null);

	console.log("\n=== 10. Delete requires patient.documents.delete permission ===");
	await prisma.userPermission.upsert({
		where: { userId_permissionKey: { userId: testVa.id, permissionKey: "patient.documents.delete" } },
		create: { userId: testVa.id, permissionKey: "patient.documents.delete", granted: false },
		update: { granted: false },
	});
	const blockedDelete = await request(app).delete(`/api/documents/${documentId}`).set("Authorization", `Bearer ${vaToken}`);
	check("blocked without permission -> 403", blockedDelete.status === 403, blockedDelete.body?.message);
	await prisma.userPermission.deleteMany({ where: { userId: testVa.id } });

	console.log("\n=== 11. Real Cloudinary delete ===");
	const deleteResp = await request(app).delete(`/api/documents/${documentId}`).set("Authorization", `Bearer ${adminToken}`);
	check("200 OK", deleteResp.status === 200, deleteResp.body?.message);
	const stillInDb = await prisma.document.findUnique({ where: { id: documentId } });
	check("DB row actually gone", stillInDb === null);

	console.log("\n=== 12. Folder delete safety — refuses non-empty folder ===");
	// myPatientDocId was uploaded with no folderId (root/"Uncategorized") — move
	// it into the folder first so there is actually something in it to refuse
	// deleting, and so the next step's force-delete has a real Cloudinary asset
	// to clean up.
	await prisma.document.update({ where: { id: myPatientDocId }, data: { folderId } });
	const refusedDelete = await request(app).delete(`/api/documents/folders/${folderId}`).set("Authorization", `Bearer ${adminToken}`);
	check(
		"409 — folder still has content (myPatientDoc moved in)",
		refusedDelete.status === 409,
		refusedDelete.body?.message,
	);

	console.log("\n=== 13. Force-delete cascades and cleans up Cloudinary ===");
	const forceDelete = await request(app)
		.delete(`/api/documents/folders/${folderId}?force=true`)
		.set("Authorization", `Bearer ${adminToken}`);
	check("200 OK", forceDelete.status === 200, forceDelete.body?.message);
	const folderGone = await prisma.documentFolder.findUnique({ where: { id: folderId } });
	check("folder gone", folderGone === null);
	const docGone = await prisma.document.findUnique({ where: { id: myPatientDocId } });
	check("document inside it gone too (cascade)", docGone === null);

	console.log("\n=== 14. Audit trail ===");
	const auditRows = await prisma.activityLog.findMany({
		where: { entityType: { in: ["document", "document_folder"] }, message: { contains: `${RUN_ID}` } },
	});
	console.log(`  (${auditRows.length} audit rows reference this test run's folder name)`);

	// cleanup
	await prisma.patient.deleteMany({ where: { id: { in: [myPatient.id, otherPatient.id] } } });
	console.log("\n  (test patients cleaned up)");

	console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
	await prisma.$disconnect();
	process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
	console.error("HARNESS ERROR:", e);
	await prisma.$disconnect();
	process.exit(1);
});
