/**
 * Proves the backend's appointment handling is independent of the server's own
 * timezone — the bug that made Optimantra appointments land 10–11 hours off.
 * Run: npx tsx scripts/verify-server-timezone.ts
 */
import { combineWebhookDateAndTime, getClinicHour, zonedWallClockToUtc } from "@/utils/clinicTime";

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

const SERVER_ZONES = ["Asia/Dhaka", "UTC", "America/New_York", "America/Los_Angeles"];

console.log("\n=== Optimantra webhook: Sep 28 2026, apptStartTime '21:00' (9 PM clinic time) ===");
console.log("    Correct instant = 2026-09-29T01:00:00.000Z (9 PM EDT)\n");
for (const tz of SERVER_ZONES) {
	process.env.TZ = tz;
	const result = combineWebhookDateAndTime("Mon Sep 28 04:00:00 2026", "21:00");
	check(`server TZ=${tz.padEnd(20)} -> correct instant`, result?.toISOString() === "2026-09-29T01:00:00.000Z", result?.toISOString());
}

console.log("\n=== Same, in WINTER (EST, UTC-5): Jan 15 2026 at 21:00 clinic time ===");
console.log("    Correct instant = 2026-01-16T02:00:00.000Z (9 PM EST)\n");
for (const tz of SERVER_ZONES) {
	process.env.TZ = tz;
	const result = combineWebhookDateAndTime("Thu Jan 15 04:00:00 2026", "21:00");
	check(`server TZ=${tz.padEnd(20)} -> DST handled`, result?.toISOString() === "2026-01-16T02:00:00.000Z", result?.toISOString());
}

console.log("\n=== VA auto-assign cutoff reads CLINIC hour, not server hour ===");
console.log("    9:00 AM Eastern = 13:00 UTC. Must read as hour 9 (-> Jude), never 13 (-> Amanda).\n");
const nineAmEastern = new Date("2026-09-28T13:00:00Z");
for (const tz of SERVER_ZONES) {
	process.env.TZ = tz;
	const hour = getClinicHour(nineAmEastern);
	check(`server TZ=${tz.padEnd(20)} -> hour ${hour}, routes to ${hour < 12 ? "JUDE" : "AMANDA"}`, hour === 9, `hour=${hour}`);
}

console.log("\n=== A late-evening slot must not roll to the wrong calendar day ===");
const lateNight = zonedWallClockToUtc(2026, 5, 10, 23, 30);
check("11:30 PM May 10 clinic -> 2026-05-11T03:30:00Z", lateNight.toISOString() === "2026-05-11T03:30:00.000Z", lateNight.toISOString());
check("reads back as hour 23 in clinic tz", getClinicHour(lateNight) === 23, String(getClinicHour(lateNight)));

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail === 0 ? 0 : 1);
