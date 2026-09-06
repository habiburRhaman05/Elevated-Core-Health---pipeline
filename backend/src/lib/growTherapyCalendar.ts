import type { ParameterValue, VEvent } from "node-ical";
import ical from "node-ical";

import { logger } from "@/utils/logger";

/**
 * One synced-worthy occurrence pulled from the Grow Therapy Google Calendar
 * .ics feed. "Occurrence" and not "event" deliberately — a recurring booking
 * (e.g. "Weekly on Wednesday, 4 times") shares ONE calendar UID across every
 * instance, so `googleUid` alone cannot be the sync identity (see `eventKey`).
 */
export interface GrowTherapyEvent {
	/**
	 * The actual identity key this module syncs against:
	 * `${googleUid}::${startTime.toISOString()}`. A recurring series' 2nd/3rd/
	 * 4th occurrence would otherwise collide with the 1st under the raw UID —
	 * Google reuses the same UID for every instance of a series, distinguished
	 * only by start time (RECURRENCE-ID).
	 */
	eventKey: string;
	/** Raw ICS UID — shared across every occurrence of a recurring series. */
	googleUid: string;
	providerName: string | null;
	/** Whatever sits between "<>" and "Telehealth" in the title, verbatim (not assumed to be exactly 2 letters — real data includes things like "7.A"). */
	patientInitials: string | null;
	/** Only set when the description contains an explicit "Patient:"/"Client:" label — never a guess. Falls back to patientInitials at the call site. */
	fullPatientName: string | null;
	/** YYYY-MM-DD, for logging/display only. */
	appointmentDate: string;
	startTime: Date;
	endTime: Date | null;
	telehealthLink: string | null;
	/** ICS LAST-MODIFIED, falling back to DTSTAMP, falling back to the start time. This is what the next poll diffs against. */
	lastModifiedTime: Date;
	rawTitle: string;
	/**
	 * Raw iCal description body, for in-memory use only — feeds the Groq
	 * full-name fallback (patientNameExtractor.ts) when the regex layer finds
	 * no labeled name on a first-time sync. Deliberately never persisted:
	 * buildGrowTherapyMetadata() (the caller) omits it, so the description
	 * never touches the database.
	 */
	rawDescription: string;
}

/** node-ical hands back plain strings OR `{ params, val }` when a property carries iCal parameters (e.g. `SUMMARY;LANGUAGE=de:...`). Normalize to a plain string either way. */
function paramValueToString(value: ParameterValue | undefined | null): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "object" && "val" in (value as Record<string, unknown>)) {
		return String((value as { val?: unknown }).val ?? "");
	}
	return String(value);
}

const GROW_THERAPY_KEYWORDS = ["growtherapystaging", "growtherapy", "grow"];

/** Case-insensitive match across summary + description + location, per the client's explicit filter spec (also matches the staging domain so test bookings aren't silently dropped). */
export function isGrowTherapyEvent(summary: string, description: string, location: string): boolean {
	const blob = `${summary} ${description} ${location}`.toLowerCase();
	return GROW_THERAPY_KEYWORDS.some((kw) => blob.includes(kw));
}

/**
 * "Abbi Abrams <> O.B Telehealth Appointment" ->
 *   { providerName: "Abbi Abrams", patientInitials: "O.B" }
 *
 * Deliberately loose on the right-hand side: real titles include odd values
 * like "7.A", not just letter-dot-letter, so this takes whatever text sits
 * between "<>" and the word "Telehealth" verbatim rather than assuming a
 * strict `[A-Z]\.[A-Z]` shape.
 */
export function parseGrowTherapyTitle(summary: string): {
	providerName: string | null;
	patientInitials: string | null;
} {
	const parts = summary.split("<>");
	if (parts.length < 2) return { providerName: null, patientInitials: null };

	const providerName = parts[0].trim() || null;
	// Re-join in case "<>" appears more than once — only the first split matters.
	const rest = parts.slice(1).join("<>");
	const beforeTelehealth = rest.match(/^(.*?)telehealth/i);
	const patientInitials = (beforeTelehealth ? beforeTelehealth[1] : rest).trim() || null;

	return { providerName, patientInitials };
}

/**
 * Best-effort scan of the event description for an explicitly labeled full
 * name ("Patient: John Smith" / "Client - John Smith"). Deliberately narrow:
 * grabbing the wrong line of free-text calendar description as a "name" is
 * worse than just falling back to initials, and per CLAUDE.md this app must
 * never go hunting through free text for more than it's explicitly told is
 * there — the raw description is never stored, only this narrow extraction.
 */
export function extractFullPatientName(description: string): string | null {
	const match = description.match(/(?:patient|client)\s*(?:name)?\s*[:-]\s*([A-Za-z][A-Za-z .'-]{1,80})/i);
	if (!match) return null;
	const name = match[1].trim();
	return name.length > 0 ? name : null;
}

/** First http(s) link found in the description or location — Grow Therapy's telehealth join URL. */
export function extractTelehealthLink(description: string, location: string): string | null {
	const match = `${description}\n${location}`.match(/https?:\/\/[^\s<>"']+/i);
	return match ? match[0] : null;
}

// How far back/forward to expand a recurring series on each poll. A small
// trailing window still catches a same-day edit; a patient's whole series
// doesn't need to be re-synced every 10 minutes once it's in the past.
const RECURRENCE_WINDOW_PAST_DAYS = 3;
const RECURRENCE_WINDOW_FUTURE_DAYS = 90;

/**
 * Fetches and parses the Grow Therapy .ics feed into individual, filtered
 * occurrences ready to sync. Never throws for a single malformed event —
 * only for the fetch/parse of the feed itself, which the caller should
 * surface as a sync-run failure (there is nothing else to do with a feed
 * that can't be read at all).
 */
export async function fetchGrowTherapyEvents(icsUrl: string): Promise<GrowTherapyEvent[]> {
	const response = await fetch(icsUrl, { signal: AbortSignal.timeout(15000) });
	if (!response.ok) {
		throw new Error(`Failed to fetch Grow Therapy calendar feed (HTTP ${response.status})`);
	}
	const rawIcsText = await response.text();
	const parsed = ical.parseICS(rawIcsText);

	const now = new Date();
	const from = new Date(now.getTime() - RECURRENCE_WINDOW_PAST_DAYS * 86_400_000);
	const to = new Date(now.getTime() + RECURRENCE_WINDOW_FUTURE_DAYS * 86_400_000);

	const events: GrowTherapyEvent[] = [];

	for (const key of Object.keys(parsed)) {
		const item = parsed[key];
		if (!item || item.type !== "VEVENT") continue;

		// Google reuses the SAME uid across every occurrence of a recurring
		// series, so only a recurring series actually needs a per-occurrence
		// disambiguator appended to it. A plain one-off event's identity is
		// just its bare uid — critically, that must stay TRUE even after the
		// event is rescheduled, or a reschedule looks identical to "a brand
		// new event" and creates a duplicate patient instead of updating the
		// existing one (exactly the bug seen in testing: editing a single
		// event's time changed its key, since the key used to include the
		// CURRENT start time unconditionally).
		const isRecurringSeries = Boolean(item.rrule);
		const occurrences: Array<{ start: Date; end: Date | null; event: VEvent; slotIdentity: string }> = [];

		if (isRecurringSeries) {
			try {
				const expanded = ical.expandRecurringEvent(item, { from, to });
				for (const inst of expanded) {
					// `recurrenceid` is this occurrence's ORIGINAL scheduled slot in
					// the series — it stays fixed even if that one occurrence is
					// later individually rescheduled (only its start time moves).
					// For an occurrence that has never been individually
					// rescheduled there's no override yet, so `inst.start` (as
					// computed straight from the RRULE) IS that stable slot —
					// and it's what the previous poll would have stored too.
					const slot = inst.event.recurrenceid ?? inst.start;
					occurrences.push({ start: inst.start, end: inst.end ?? null, event: inst.event, slotIdentity: slot.toISOString() });
				}
			} catch (err) {
				// Malformed RRULE or similar — fall back to the base occurrence
				// rather than silently dropping the whole series.
				logger.warn(
					{ err, uid: item.uid },
					"Grow Therapy sync — failed to expand recurring event, using base occurrence only",
				);
				if (item.start) {
					occurrences.push({ start: item.start, end: item.end ?? null, event: item, slotIdentity: item.start.toISOString() });
				}
			}
		} else if (item.start) {
			occurrences.push({ start: item.start, end: item.end ?? null, event: item, slotIdentity: "" });
		}

		for (const { start, end, event, slotIdentity } of occurrences) {
			const summary = paramValueToString(event.summary);
			const description = paramValueToString(event.description);
			const location = paramValueToString(event.location);

			if (!isGrowTherapyEvent(summary, description, location)) continue;
			if (!start) continue;

			const { providerName, patientInitials } = parseGrowTherapyTitle(summary);
			const fullPatientName = description ? extractFullPatientName(description) : null;
			const telehealthLink = extractTelehealthLink(description, location);
			const lastModifiedTime = event.lastmodified ?? event.dtstamp ?? start;
			const uid = event.uid || item.uid;

			if (!uid) continue;

			events.push({
				eventKey: isRecurringSeries ? `${uid}::${slotIdentity}` : uid,
				googleUid: uid,
				providerName,
				patientInitials,
				fullPatientName,
				appointmentDate: start.toISOString().slice(0, 10),
				startTime: start,
				endTime: end,
				telehealthLink,
				lastModifiedTime,
				rawTitle: summary,
				rawDescription: description,
			});
		}
	}

	return events;
}
