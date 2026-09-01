/**
 * Verification harness for the Klarity webhook (POST /patients/intake/klarity)
 * and its appointment-history feature.
 *
 * Exercises the real database through:
 *   1. requireKlarityToken  — bearer auth accept/reject
 *   2. KlarityIntakeSchema  — validation of all five documented payload shapes
 *   3. patientsService.intakeKlarity — the event dispatcher and its handlers
 *   4. AppointmentHistory — a second booking attaches instead of duplicating/
 *      rejecting, per-appointment status, previousDatetime on reschedule,
 *      "next appointment" recompute, Donna default assignment
 *   5. patientsService.getAppointmentHistory — the new history endpoint
 *
 * Run: npx tsx scripts/verify-klarity.ts
 * Creates one patient (two appointments) with throwaway ids and deletes them at the end.
 */

import { requireKlarityToken } from "@/middlewares/klarityAuth";
import { patientsService } from "@/moduels/patients/patients.service";
import { KlarityIntakeSchema } from "@/moduels/patients/patients.validation";
import type { AuthenticatedUser } from "@/lib/types";
import { env } from "@/utils/envConfig";
import { prisma } from "@/utils/prisma";

const APPT_ID = `verify-${Date.now()}`;
const APPT_ID_2 = `verify2-${Date.now()}`;
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

const EMAIL = `jane.${Date.now()}@example.com`;
const PHONE = `+1555${String(Date.now()).slice(-7)}`;

const basePatient = {
	id: CLIENT_ID,
	firstName: "Jane",
	lastName: "Doe",
	preferredName: null,
	email: EMAIL,
	phone: PHONE,
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
	// A SECOND, different appointment for the SAME person — this is the exact
	// scenario that used to get rejected as a duplicate or silently overwrite
	// the first booking. Far enough out that it stays "upcoming" relative to
	// APPT_ID's date for the recompute-next-appointment checks below.
	secondBooking: {
		source: "klarity",
		eventType: "appointment.created",
		eventTimestamp: "2026-09-01T03:47:00Z",
		appointment: { ...baseAppt, id: APPT_ID_2, startAt: "2026-10-01T15:00:00Z", endAt: "2026-10-01T15:30:00Z" },
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
			id: APPT_ID_2,
			clientId: CLIENT_ID,
			startAt: "2026-10-01T15:00:00Z",
			endAt: "2026-10-01T15:30:00Z",
			appointmentStatus: "patient-no-show",
		},
	},
	completed: {
		source: "klarity",
		eventType: "appointment.completed",
		eventTimestamp: "2026-09-01T03:47:00Z",
		appointment: {
			id: APPT_ID_2,
			clientId: CLIENT_ID,
			startAt: "2026-10-01T15:00:00Z",
			endAt: "2026-10-01T15:30:00Z",
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

	console.log("\n=== 2. Schema accepts all documented payload shapes ===");
	for (const [name, body] of Object.entries(payloads)) {
		const r = KlarityIntakeSchema.safeParse({ body });
		check(`${name} validates`, r.success, r.success ? "" : JSON.stringify(r.error.issues[0]));
	}

	console.log("\n=== 3. appointment.created — new patient, Donna default assignment ===");
	const donna = await prisma.user.findFirst({ where: { role: { in: ["super_admin", "admin"] } }, select: { id: true, name: true } });
	console.log(`  (expecting assignedTo = "${donna?.name}" [${donna?.id}])`);

	const a = await dispatch(payloads.created);
	check("created → 201", (a as any).result?.statusCode === 201, (a as any).result?.message ?? (a as any).validationError);
	const patientId = (a as any).result?.data?.id;
	let p = patientId ? await prisma.patient.findUnique({ where: { id: patientId } }) : null;
	check("  stage = onboarding", p?.stage === "onboarding", `stage=${p?.stage}`);
	check("  bookingPlatform = klarity", p?.bookingPlatform === "klarity");
	check("  assignedTo = Donna (admin/super_admin)", !!donna && p?.assignedTo === donna.id, `assignedTo=${p?.assignedTo}`);
	check(
		"  appointmentDatetime mapped from startAt",
		p?.appointmentDatetime?.toISOString() === "2026-09-05T14:00:00.000Z",
		String(p?.appointmentDatetime?.toISOString()),
	);

	let history = patientId ? await prisma.appointmentHistory.findMany({ where: { patientId } }) : [];
	check("  1 AppointmentHistory row created", history.length === 1, `count=${history.length}`);
	check("  row status = scheduled", history[0]?.status === "scheduled", history[0]?.status);
	check("  row externalAppointmentId stored", history[0]?.externalAppointmentId === APPT_ID);

	console.log("\n=== 4. Replay of the SAME appointment id — idempotent, no duplicate ===");
	const dup = await dispatch(payloads.created);
	check("replay → 200 (not 201, not 409)", (dup as any).result?.statusCode === 200, (dup as any).result?.message);
	const patientCountForThisPerson = await prisma.patient.count({ where: { email: EMAIL } });
	check("  still exactly 1 Patient row", patientCountForThisPerson === 1, `count=${patientCountForThisPerson}`);
	history = await prisma.appointmentHistory.findMany({ where: { patientId } });
	check("  still exactly 1 AppointmentHistory row (not duplicated)", history.length === 1, `count=${history.length}`);

	console.log("\n=== 5. THE core fix: a SECOND, different booking for the SAME person ===");
	const second = await dispatch(payloads.secondBooking);
	check(
		"second booking → 200, NOT rejected as duplicate (this was the original bug)",
		(second as any).result?.statusCode === 200,
		(second as any).result?.message,
	);
	const patientCountAfterSecond = await prisma.patient.count({ where: { email: EMAIL } });
	check("  still exactly 1 Patient row (attached, not a new card)", patientCountAfterSecond === 1, `count=${patientCountAfterSecond}`);
	history = await prisma.appointmentHistory.findMany({ where: { patientId }, orderBy: { appointmentDatetime: "asc" } });
	check("  now 2 AppointmentHistory rows — first one NOT lost", history.length === 2, `count=${history.length}`);
	check("  first row's date is untouched (Sep 5)", history[0]?.appointmentDatetime.toISOString() === "2026-09-05T14:00:00.000Z");
	check("  second row's date is the new booking (Oct 1)", history[1]?.appointmentDatetime.toISOString() === "2026-10-01T15:00:00.000Z");
	p = await prisma.patient.findUnique({ where: { id: patientId } });
	check(
		"  patient's 'next appointment' = the SOONER of the two (Sep 5, not Oct 1)",
		p?.appointmentDatetime?.toISOString() === "2026-09-05T14:00:00.000Z",
		String(p?.appointmentDatetime?.toISOString()),
	);

	console.log("\n=== 6. appointment.rescheduled — moves ONE appointment, keeps previousDatetime ===");
	const r = await dispatch(payloads.rescheduled);
	check("rescheduled → 200", (r as any).result?.statusCode === 200, (r as any).result?.message);
	const reschedRow = await prisma.appointmentHistory.findUnique({ where: { externalAppointmentId: APPT_ID } });
	check("  row status = rescheduled", reschedRow?.status === "rescheduled", reschedRow?.status);
	check(
		"  row moved to Sep 6",
		reschedRow?.appointmentDatetime.toISOString() === "2026-09-06T16:00:00.000Z",
		String(reschedRow?.appointmentDatetime.toISOString()),
	);
	check(
		"  previousDatetime preserved = old Sep 5 value (not lost)",
		reschedRow?.previousDatetime?.toISOString() === "2026-09-05T14:00:00.000Z",
		String(reschedRow?.previousDatetime?.toISOString()),
	);
	const otherRow = await prisma.appointmentHistory.findUnique({ where: { externalAppointmentId: APPT_ID_2 } });
	check("  the OTHER appointment (Oct 1) is untouched", otherRow?.status === "scheduled", otherRow?.status);
	p = await prisma.patient.findUnique({ where: { id: patientId } });
	check(
		"  patient's next appointment recomputed to Sep 6 (still soonest)",
		p?.appointmentDatetime?.toISOString() === "2026-09-06T16:00:00.000Z",
		String(p?.appointmentDatetime?.toISOString()),
	);

	console.log("\n=== 7. no_show / completed on the SECOND appointment only ===");
	const ns = await dispatch(payloads.noShow);
	check("no_show (minimal payload, no patient block) → 200", (ns as any).result?.statusCode === 200, (ns as any).result?.message);
	let row2 = await prisma.appointmentHistory.findUnique({ where: { externalAppointmentId: APPT_ID_2 } });
	check("  that row's status = no_show", row2?.status === "no_show", row2?.status);
	p = await prisma.patient.findUnique({ where: { id: patientId } });
	check("  patient.visitStatus = no_show", p?.visitStatus === "no_show", p?.visitStatus);
	const firstRowUnaffected = await prisma.appointmentHistory.findUnique({ where: { externalAppointmentId: APPT_ID } });
	check("  the OTHER appointment (rescheduled one) is unaffected", firstRowUnaffected?.status === "rescheduled");

	const c = await dispatch(payloads.completed);
	check("completed → 200", (c as any).result?.statusCode === 200, (c as any).result?.message);
	row2 = await prisma.appointmentHistory.findUnique({ where: { externalAppointmentId: APPT_ID_2 } });
	check("  that row's status = completed", row2?.status === "completed", row2?.status);
	p = await prisma.patient.findUnique({ where: { id: patientId } });
	check("  patient.visitStatus = arrived", p?.visitStatus === "arrived", p?.visitStatus);
	check("  stage still onboarding (checklist gate respected)", p?.stage === "onboarding", `stage=${p?.stage}`);

	console.log("\n=== 8. appointment.canceled — per-appointment only, card NOT cancelled ===");
	const cx = await dispatch(payloads.canceled);
	check("canceled → 200", (cx as any).result?.statusCode === 200, (cx as any).result?.message);
	const cancelledRow = await prisma.appointmentHistory.findUnique({ where: { externalAppointmentId: APPT_ID } });
	check("  THAT row's status = canceled", cancelledRow?.status === "canceled", cancelledRow?.status);
	p = await prisma.patient.findUnique({ where: { id: patientId } });
	check(
		"  patient.status is STILL 'active' — cancelling one appointment must not cancel the whole card",
		p?.status === "active",
		`status=${p?.status}`,
	);
	check(
		"  patient's next appointment moved on (Oct 1, since Sep 6 is now cancelled)",
		p?.appointmentDatetime?.toISOString() === "2026-10-01T15:00:00.000Z",
		String(p?.appointmentDatetime?.toISOString()),
	);

	const cx2 = await dispatch(payloads.canceled);
	check("canceled replay → no-op", (cx2 as any).result?.message?.includes("already cancelled"), (cx2 as any).result?.message);

	console.log("\n=== 9. Edge cases ===");
	const un = await dispatch(payloads.unknown);
	check("unknown event type → 202 acknowledged", (un as any).result?.statusCode === 202, (un as any).result?.message);

	const orphan = await dispatch({
		...payloads.noShow,
		appointment: { ...payloads.noShow.appointment, id: `nonexistent-${Date.now()}` },
	});
	check("event for unknown appointment id → 202", (orphan as any).result?.statusCode === 202, (orphan as any).result?.message);

	console.log("\n=== 10. GET /:id/appointment-history (patientsService.getAppointmentHistory) ===");
	const fakeAdmin = { id: donna?.id ?? "x", role: "super_admin" } as unknown as AuthenticatedUser;
	const histResp = await patientsService.getAppointmentHistory(patientId, fakeAdmin);
	check("history endpoint → success", histResp.statusCode === 200, histResp.message);
	check("  returns 2 rows, newest first", Array.isArray(histResp.data) && (histResp.data as any[]).length === 2);
	check(
		"  newest first ordering (Oct 1 before Sep 6)",
		(histResp.data as any[])?.[0]?.appointmentDatetime?.toISOString?.() === "2026-10-01T15:00:00.000Z",
	);

	const emptyHistResp = await patientsService.getAppointmentHistory("00000000-0000-0000-0000-000000000000", fakeAdmin);
	check("history for nonexistent patient → 404 (not a crash)", emptyHistResp.statusCode === 404);

	// cleanup
	if (patientId) {
		await prisma.appointmentHistory.deleteMany({ where: { patientId } });
		await prisma.activityLog.deleteMany({ where: { patientId } });
		await prisma.patient.delete({ where: { id: patientId } }).catch(() => {});
		console.log("\n  (test patient + appointment history cleaned up)");
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
