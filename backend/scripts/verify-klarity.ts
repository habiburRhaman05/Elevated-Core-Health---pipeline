/**
 * Verification harness for the Klarity webhook (POST /patients/intake/klarity).
 *
 * Exercises the three layers the endpoint is made of, against the real database:
 *   1. requireKlarityToken  — bearer auth accept/reject
 *   2. KlarityIntakeSchema  — validation of all five documented payload shapes
 *   3. patientsService.intakeKlarity — the event dispatcher and its handlers
 *
 * Run: npx tsx scripts/verify-klarity.ts
 * Creates one patient with a throwaway appointment id and deletes it at the end.
 */

import { requireKlarityToken } from "@/middlewares/klarityAuth";
import { patientsService } from "@/moduels/patients/patients.service";
import { KlarityIntakeSchema } from "@/moduels/patients/patients.validation";
import { env } from "@/utils/envConfig";
import { prisma } from "@/utils/prisma";

const APPT_ID = `verify-${Date.now()}`;
const CLIENT_ID = `client-${Date.now()}`;

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

/** Minimal Express req/res doubles so the middleware can be driven directly. */
function runAuth(authHeader: string | undefined): { status: number; body: any } {
	let status = 0;
	let body: any = null;
	const req: any = { headers: authHeader ? { authorization: authHeader } : {}, path: "/intake/klarity", ip: "test" };
	const res: any = {
		status(c: number) {
			status = c;
			return this;
		},
		send(b: any) {
			body = b;
			return this;
		},
		json(b: any) {
			body = b;
			return this;
		},
	};
	requireKlarityToken(req, res, () => {
		status = 200;
		body = { passed: true };
	});
	return { status, body };
}

const basePatient = {
	id: CLIENT_ID,
	firstName: "Jane",
	lastName: "Doe",
	preferredName: null,
	email: `jane.${Date.now()}@example.com`,
	phone: `+1555${String(Date.now()).slice(-7)}`,
	dob: "1990-01-15",
	gender: "Female",
	type: "patient",
	status: "Active",
};

const baseAppt = {
	id: APPT_ID,
	appointmentName: "Follow-up Visit",
	clientId: CLIENT_ID,
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
};

const meta = { vendor: "klarity", trigger: "polling", syncVersion: "1.0" };
const insurance = { primaryPayer: null, memberId: null, groupNumber: null, planName: null };
const extra = { location: null, address: null };

const payloads = {
	created: {
		source: "klarity",
		eventType: "appointment.created",
		eventTimestamp: "2026-09-01T03:47:00Z",
		appointment: baseAppt,
		patient: basePatient,
		insurance,
		extra,
		meta,
	},
	rescheduled: {
		source: "klarity",
		eventType: "appointment.rescheduled",
		eventTimestamp: "2026-09-01T03:47:00Z",
		appointment: { ...baseAppt, startAt: "2026-09-06T16:00:00Z", endAt: "2026-09-06T16:30:00Z" },
		patient: basePatient,
		insurance,
		extra,
		meta,
	},
	canceled: {
		source: "klarity",
		eventType: "appointment.canceled",
		eventTimestamp: "2026-09-01T03:47:00Z",
		appointment: { ...baseAppt, appointmentStatus: "canceled" },
		patient: basePatient,
		insurance,
		extra,
		meta,
	},
	// Note the shape difference: no patient / insurance / extra / meta at all.
	noShow: {
		source: "klarity",
		eventType: "appointment.no_show",
		eventTimestamp: "2026-09-01T03:47:00Z",
		appointment: {
			id: APPT_ID,
			clientId: CLIENT_ID,
			startAt: "2026-09-05T14:00:00Z",
			endAt: "2026-09-05T14:30:00Z",
			appointmentStatus: "patient-no-show",
		},
	},
	completed: {
		source: "klarity",
		eventType: "appointment.completed",
		eventTimestamp: "2026-09-01T03:47:00Z",
		appointment: {
			id: APPT_ID,
			clientId: CLIENT_ID,
			startAt: "2026-09-05T14:00:00Z",
			endAt: "2026-09-05T14:30:00Z",
			appointmentStatus: "showed",
		},
	},
	unknown: {
		source: "klarity",
		eventType: "appointment.something_new",
		eventTimestamp: "2026-09-01T03:47:00Z",
		appointment: { id: APPT_ID, clientId: CLIENT_ID, startAt: "2026-09-05T14:00:00Z", endAt: "2026-09-05T14:30:00Z", appointmentStatus: "x" },
	},
};

/** Validate through the real Zod schema, then hand the parsed body to the service. */
async function dispatch(raw: unknown) {
	const parsed = KlarityIntakeSchema.safeParse({ body: raw });
	if (!parsed.success) {
		return { validationError: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
	}
	const result = await patientsService.intakeKlarity(parsed.data.body as any);
	return { result };
}

async function main() {
	console.log("\n=== 1. Bearer token auth (requireKlarityToken) ===");
	check("valid token passes", runAuth(env.KLARITY_WEBHOOK_TOKEN).status === 200);
	check("missing header rejected 401", runAuth(undefined).status === 401);
	check("wrong token rejected 401", runAuth("Bearer wrongtoken12345").status === 401);
	check("non-Bearer scheme rejected 401", runAuth("Basic abc123").status === 401);
	check("bare token without Bearer rejected 401", runAuth("wwre2543tetewr3543r4werwer634266").status === 401);
	console.log(`  (configured token = "${env.KLARITY_WEBHOOK_TOKEN}")`);

	console.log("\n=== 2. Schema accepts all five documented payload shapes ===");
	for (const [name, body] of Object.entries(payloads)) {
		const r = KlarityIntakeSchema.safeParse({ body });
		check(`${name} validates`, r.success, r.success ? "" : JSON.stringify(r.error.issues[0]));
	}

	console.log("\n=== 3. Event dispatch against the live database ===");

	const a = await dispatch(payloads.created);
	check("created → 201", (a as any).result?.statusCode === 201, (a as any).result?.message ?? (a as any).validationError);
	const patientId = (a as any).result?.data?.id;
	const created = patientId ? await prisma.patient.findUnique({ where: { id: patientId } }) : null;
	check("  stage = onboarding", created?.stage === "onboarding", `stage=${created?.stage}`);
	check("  bookingPlatform = klarity", created?.bookingPlatform === "klarity");
	check("  externalAppointmentId stored", created?.externalAppointmentId === APPT_ID);
	check("  appointmentEndDatetime stored", !!created?.appointmentEndDatetime, String(created?.appointmentEndDatetime));
	check(
		"  startAt mapped",
		created?.appointmentDatetime?.toISOString() === "2026-09-05T14:00:00.000Z",
		String(created?.appointmentDatetime?.toISOString()),
	);

	const dup = await dispatch(payloads.created);
	check(
		"created replay → idempotent (no duplicate)",
		(dup as any).result?.statusCode === 200,
		(dup as any).result?.message,
	);
	const countAfterReplay = await prisma.patient.count({ where: { externalAppointmentId: APPT_ID } });
	check("  still exactly 1 row", countAfterReplay === 1, `count=${countAfterReplay}`);

	const r = await dispatch(payloads.rescheduled);
	check("rescheduled → 200", (r as any).result?.statusCode === 200, (r as any).result?.message);
	const resched = await prisma.patient.findUnique({ where: { externalAppointmentId: APPT_ID } });
	check(
		"  appointment moved to Sep 6",
		resched?.appointmentDatetime?.toISOString() === "2026-09-06T16:00:00.000Z",
		String(resched?.appointmentDatetime?.toISOString()),
	);
	check("  visitStatus = rescheduled", resched?.visitStatus === "rescheduled", `visitStatus=${resched?.visitStatus}`);
	check("  stage unchanged (still onboarding)", resched?.stage === "onboarding", `stage=${resched?.stage}`);

	const ns = await dispatch(payloads.noShow);
	check("no_show (no patient block) → 200", (ns as any).result?.statusCode === 200, (ns as any).result?.message);
	const afterNs = await prisma.patient.findUnique({ where: { externalAppointmentId: APPT_ID } });
	check("  visitStatus = no_show", afterNs?.visitStatus === "no_show", `visitStatus=${afterNs?.visitStatus}`);

	const c = await dispatch(payloads.completed);
	check("completed (no patient block) → 200", (c as any).result?.statusCode === 200, (c as any).result?.message);
	const afterC = await prisma.patient.findUnique({ where: { externalAppointmentId: APPT_ID } });
	check("  visitStatus = arrived", afterC?.visitStatus === "arrived", `visitStatus=${afterC?.visitStatus}`);
	check("  stage still onboarding (checklist gate respected)", afterC?.stage === "onboarding", `stage=${afterC?.stage}`);

	const cx = await dispatch(payloads.canceled);
	check("canceled → 200", (cx as any).result?.statusCode === 200, (cx as any).result?.message);
	const afterCx = await prisma.patient.findUnique({ where: { externalAppointmentId: APPT_ID } });
	check("  status = cancelled", afterCx?.status === "cancelled", `status=${afterCx?.status}`);
	check("  cancelledAt set", !!afterCx?.cancelledAt);

	const cx2 = await dispatch(payloads.canceled);
	check("canceled replay → no-op", (cx2 as any).result?.message?.includes("already cancelled"), (cx2 as any).result?.message);

	const un = await dispatch(payloads.unknown);
	check("unknown event → 202 acknowledged", (un as any).result?.statusCode === 202, (un as any).result?.message);

	const orphan = await dispatch({
		...payloads.noShow,
		appointment: { ...payloads.noShow.appointment, id: `nonexistent-${Date.now()}` },
	});
	check("event for unknown appointment → 202", (orphan as any).result?.statusCode === 202, (orphan as any).result?.message);

	// cleanup
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
