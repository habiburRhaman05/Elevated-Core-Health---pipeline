/**
 * HTTP-layer check for POST /api/patients/intake/klarity.
 *
 * Drives the real Express app in-process via supertest, so this covers the
 * pieces the service-level harness cannot: route mounting, the bearer-token
 * middleware running before validation, and the JSON body parser.
 *
 * Run: npx tsx scripts/verify-klarity-http.ts
 */

import request from "supertest";

import { app } from "@/server";
import { env } from "@/utils/envConfig";
import { prisma } from "@/utils/prisma";

const URL = "/api/patients/intake/klarity";
const TOKEN = env.KLARITY_WEBHOOK_TOKEN;
const APPT_ID = `http-verify-${Date.now()}`;

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

const createdPayload = {
	source: "klarity",
	eventType: "appointment.created",
	eventTimestamp: "2026-09-01T03:47:00Z",
	appointment: {
		id: APPT_ID,
		appointmentName: "Follow-up Visit",
		clientId: 67890,
		startAt: "2026-09-05T14:00:00Z",
		endAt: "2026-09-05T14:30:00Z",
		appointmentStatus: "scheduled",
		contactType: "video",
		serviceType: "Follow-up",
		serviceItemId: 222,
		serviceSpecialty: "Psychiatry",
		providerFirstName: "John",
		providerLastName: "Doe",
		reason: "Medication follow-up",
		notes: null,
		intakeFormStatus: "COMPLETE",
	},
	patient: {
		id: 67890,
		firstName: "HttpVerify",
		lastName: "Tester",
		preferredName: null,
		email: `http.verify.${Date.now()}@example.com`,
		phone: `+1777${String(Date.now()).slice(-7)}`,
		dob: "1990-01-15",
		gender: "Female",
		type: "patient",
		status: "Active",
	},
	insurance: { primaryPayer: null, memberId: null, groupNumber: null, planName: null },
	extra: { location: null, address: null },
	meta: { vendor: "klarity", trigger: "polling", syncVersion: "1.0" },
};

async function main() {
	console.log("\n=== Auth enforced at the route (before validation) ===");

	const noAuth = await request(app).post(URL).send(createdPayload);
	check("no Authorization header → 401", noAuth.status === 401, noAuth.body?.message);

	const badAuth = await request(app).post(URL).set("Authorization", "Bearer nope-wrong-token").send(createdPayload);
	check("wrong bearer token → 401", badAuth.status === 401, badAuth.body?.message);

	const basicAuth = await request(app).post(URL).set("Authorization", "Basic abc123").send(createdPayload);
	check("non-Bearer scheme → 401", basicAuth.status === 401, basicAuth.body?.message);

	// Auth must be checked BEFORE the body is validated — an unauthenticated
	// caller should never be able to probe the schema with a malformed body.
	const badBodyNoAuth = await request(app).post(URL).send({ garbage: true });
	check("invalid body without auth → 401 (not 400)", badBodyNoAuth.status === 401, `got ${badBodyNoAuth.status}`);

	console.log("\n=== Validation (authenticated) ===");
	const badBody = await request(app).post(URL).set("Authorization", TOKEN).send({ eventType: "appointment.created" });
	check("missing appointment → 400", badBody.status === 400, badBody.body?.message?.slice(0, 90));

	const noPatientOnCreate = await request(app)
		.post(URL)
		.set("Authorization", TOKEN)
		.send({ ...createdPayload, patient: undefined });
	check(
		"created without patient block → 400",
		noPatientOnCreate.status === 400,
		noPatientOnCreate.body?.message?.slice(0, 90),
	);

	console.log("\n=== Happy path over HTTP ===");
	const ok = await request(app).post(URL).set("Authorization", TOKEN).send(createdPayload);
	check("valid token + valid body → 201", ok.status === 201, ok.body?.message);
	const patientId = ok.body?.data?.id;
	check("  response carries patient id", !!patientId, patientId);
	check("  response name computed", ok.body?.data?.name === "HttpVerify Tester", ok.body?.data?.name);

	console.log("\n=== Lifecycle event over HTTP (minimal payload, no patient block) ===");
	const completed = await request(app)
		.post(URL)
		.set("Authorization", TOKEN)
		.send({
			source: "klarity",
			eventType: "appointment.completed",
			eventTimestamp: "2026-09-01T03:47:00Z",
			appointment: {
				id: APPT_ID,
				clientId: 67890,
				startAt: "2026-09-05T14:00:00Z",
				endAt: "2026-09-05T14:30:00Z",
				appointmentStatus: "showed",
			},
		});
	check("completed → 200", completed.status === 200, completed.body?.message);
	check("  visitStatus = arrived", completed.body?.data?.visitStatus === "arrived", completed.body?.data?.visitStatus);

	console.log("\n=== Unknown event over HTTP ===");
	const unknown = await request(app)
		.post(URL)
		.set("Authorization", TOKEN)
		.send({
			source: "klarity",
			eventType: "appointment.brand_new_thing",
			appointment: {
				id: APPT_ID,
				clientId: 67890,
				startAt: "2026-09-05T14:00:00Z",
				endAt: "2026-09-05T14:30:00Z",
				appointmentStatus: "x",
			},
		});
	check("unknown event → 202 acknowledged", unknown.status === 202, unknown.body?.message);

	console.log("\n=== Existing /intake endpoint still reachable (no regression) ===");
	const legacy = await request(app).post("/api/patients/intake").send({});
	check("POST /api/patients/intake still routes (400 not 404)", legacy.status !== 404, `status=${legacy.status}`);

	if (patientId) {
		await prisma.activityLog.deleteMany({ where: { patientId } });
		await prisma.patient.delete({ where: { id: patientId } }).catch(() => {});
		console.log("\n  (test patient cleaned up)");
	}

	console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
	await prisma.$disconnect();
	process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
	console.error("HARNESS ERROR:", e);
	await prisma.$disconnect();
	process.exit(1);
});
