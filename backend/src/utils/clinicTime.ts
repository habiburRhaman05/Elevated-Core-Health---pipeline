/**
 * Server-side clinic timezone handling.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several webhook payloads give us a date and a wall-clock time as separate
 * plain strings, with no timezone attached — e.g. Optimantra sends
 * `apptDate: "Mon Sep 28 04:00:00 2026"` plus `apptStartTime: "21:00"`, meaning
 * "9 PM at the clinic". The only correct reading of that "21:00" is 9 PM in the
 * CLINIC's timezone.
 *
 * The obvious way to assemble it — `date.setHours(21, 0)` — is wrong, because
 * `setHours` (like `getHours`, `new Date("...")` on a zoneless string, etc.)
 * resolves against whatever timezone the SERVER PROCESS happens to be running
 * in. That makes the stored instant depend on deployment environment:
 *
 *   apptStartTime "21:00" (meaning 9 PM Eastern) stored via setHours():
 *     server TZ = Asia/Dhaka      -> 2026-09-28T15:00:00Z  (displays 11:00 AM — 10h wrong)
 *     server TZ = UTC (Vercel)    -> 2026-09-28T21:00:00Z  (displays  5:00 PM —  4h wrong)
 *     server TZ = America/New_York-> 2026-09-29T01:00:00Z  (displays  9:00 PM — correct)
 *
 * Same code, same input, three different appointments — and only the last one
 * is right, purely by accident of where the process runs. In winter (EST) the
 * Dhaka case is off by 11 hours instead of 10.
 *
 * Everything here is explicitly timezone-anchored via `Intl.DateTimeFormat`, so
 * the result is identical on a laptop in Dhaka, a Vercel function in
 * us-east-1, and a container with no TZ env var set at all.
 */

/**
 * The clinic's operating timezone — matches Klarity's own configured practice
 * timezone (Calendar → Settings → Availability → Time zone: "(UTC-04:00)
 * Eastern Time Zone"), and mirrors CLINIC_TIMEZONE in the frontend's
 * `web-dashboard/src/lib/clinic-time.ts`. Keep the two in sync.
 */
export const CLINIC_TIMEZONE = "America/New_York";

interface ZonedParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
}

/**
 * Reads an instant's wall-clock components as they appear in a given IANA
 * timezone. `hourCycle: "h23"` pins the hour to 0–23 unambiguously; under
 * `hour12: false` some older ICU builds report midnight as "24", which would
 * silently corrupt every calculation downstream.
 */
export function getZonedParts(date: Date, timeZone: string = CLINIC_TIMEZONE): ZonedParts {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
	return {
		year: Number(get("year")),
		month: Number(get("month")),
		day: Number(get("day")),
		hour: Number(get("hour")),
		minute: Number(get("minute")),
		second: Number(get("second")),
	};
}

/**
 * The hour (0–23) an instant falls on IN THE CLINIC'S TIMEZONE.
 *
 * Use this instead of `date.getHours()` anywhere a business rule cares about
 * the clinic's clock — most importantly the VA auto-assignment rule
 * ("appointment before 12:00 PM local clinic time → Jude, otherwise Amanda",
 * CLAUDE.md core rule 0). `getHours()` there reads the SERVER's clock: on a
 * UTC-deployed instance, a 9:00 AM Eastern appointment (13:00 UTC) reads back
 * as hour 13 and gets routed to the evening VA.
 */
export function getClinicHour(date: Date, timeZone: string = CLINIC_TIMEZONE): number {
	return getZonedParts(date, timeZone).hour;
}

/**
 * Builds the real UTC instant for a wall-clock time expressed in a given
 * timezone — the inverse of `getZonedParts`.
 *
 * Example: `zonedWallClockToUtc(2026, 9, 28, 21, 0)` → `2026-09-29T01:00:00Z`,
 * because 9 PM on Sep 28 in New York (EDT, UTC-4) is 1 AM UTC the next day.
 * Correct across DST automatically — the same call in January resolves against
 * EST (UTC-5) instead, with no branching or offset table needed here.
 *
 * Algorithm: treat the wall-clock digits as though they were UTC to get a
 * throwaway guess instant, ask what that guess actually reads as in the target
 * timezone, then shift by however far off that reading was. One pass is exact
 * except inside the ~1 hour that a local clock is skipped or repeated at a DST
 * boundary — an inherent ambiguity in the input itself, not something any
 * conversion can resolve.
 *
 * @param month 1-based (January = 1), matching how humans and webhook payloads write dates.
 */
export function zonedWallClockToUtc(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	second = 0,
	timeZone: string = CLINIC_TIMEZONE,
): Date {
	const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, second);
	const asRead = getZonedParts(new Date(utcGuessMs), timeZone);
	const asReadAsUtcMs = Date.UTC(
		asRead.year,
		asRead.month - 1,
		asRead.day,
		asRead.hour,
		asRead.minute,
		asRead.second,
	);
	return new Date(utcGuessMs + (utcGuessMs - asReadAsUtcMs));
}

/**
 * Combines a webhook's separate date string and "HH:mm" time string into the
 * correct UTC instant, reading the time as CLINIC-local.
 *
 * `dateSource` is parsed only for its calendar date — any time component it
 * carries is ignored (Optimantra puts a meaningless placeholder there, e.g.
 * the "04:00:00" in "Mon Sep 28 04:00:00 2026"). Because that string has no
 * timezone, the runtime parses it against the server's own zone; reading the
 * Y/M/D straight back off it with the matching local getters is self-consistent
 * (parse and read cancel out), so the calendar date survives intact on any
 * server. Only the HOUR needs explicit anchoring, which
 * `zonedWallClockToUtc` then does.
 *
 * Returns null when either input is unusable, so callers can log and continue
 * rather than storing a silently wrong appointment.
 */
export function combineWebhookDateAndTime(
	dateSource: string,
	timeSource: string,
	timeZone: string = CLINIC_TIMEZONE,
): Date | null {
	const parsedDate = new Date(dateSource);
	if (Number.isNaN(parsedDate.getTime())) return null;

	const timeMatch = timeSource.match(/^(\d{1,2}):(\d{2})/);
	if (!timeMatch) return null;

	const hour = Number(timeMatch[1]);
	const minute = Number(timeMatch[2]);
	if (hour > 23 || minute > 59) return null;

	return zonedWallClockToUtc(
		parsedDate.getFullYear(),
		parsedDate.getMonth() + 1,
		parsedDate.getDate(),
		hour,
		minute,
		0,
		timeZone,
	);
}
