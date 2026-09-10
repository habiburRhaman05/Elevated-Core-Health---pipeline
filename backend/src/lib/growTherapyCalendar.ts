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
	/**
	 * The patient's real full name, when we actually have one — either an
	 * explicit "Patient:"/"Client:" label in the description, OR (see
	 * `titleLeftIsPatientName`) the title's left-of-"<>" text when its
	 * initials match the right-hand `patientInitials` exactly (Grow Therapy's
	 * own patient-facing invites repeat the patient's own name on both sides
	 * of "<>", e.g. "Chase Brighton <> C.B Telehealth Appointment"). Never a
	 * guess — falls back to patientInitials at the call site.
	 */
	fullPatientName: string | null;
	/** Attendee email pulled straight off the ICS event (never the organizer's own address), or null if the event has no attendee. */
	patientEmail: string | null;
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

// Real Grow Therapy invites NEVER put the word "grow" in the title — see
// parseGrowTherapyTitle's doc comment for a real example. The only reliable
// signal is the telehealth/portal link's actual hostname, which only ever
// shows up in `location` or `description`. A loose "does this text contain
// the word grow" scan across the title too is both a false-positive risk
// (any unrelated event that happens to mention "grow") and gave a false
// sense of safety while doing nothing for real invites — this replaces it.
const GROW_THERAPY_DOMAINS = ["growtherapystaging.com", "growtherapy.com"];

/** Every http(s) URL found in `text`, in order. */
function extractUrls(text: string): string[] {
	return text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
}

/** True when `url`'s hostname is a Grow Therapy domain or any subdomain of one (covers `telehealth.`, `provider.`, `www.`, etc.). */
function hostIsGrowTherapy(url: string): boolean {
	try {
		const host = new URL(url).hostname.toLowerCase();
		return GROW_THERAPY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
	} catch {
		return false;
	}
}

/** Detects a Grow Therapy event strictly by the hostname of a link in its location/description — never by scanning free text for the word "grow". */
export function isGrowTherapyEvent(description: string, location: string): boolean {
	const urls = [...extractUrls(location), ...extractUrls(description)];
	return urls.some(hostIsGrowTherapy);
}

/**
 * "Abbi Abrams <> O.B Telehealth Appointment" ->
 *   { leftName: "Abbi Abrams", patientInitials: "O.B" }
 *
 * The left side is NOT always the provider — see `titleLeftIsPatientName`
 * immediately below for the real, confirmed counter-example: Grow Therapy's
 * own patient-facing calendar invites repeat the PATIENT's own name on the
 * left ("Chase Brighton <> C.B Telehealth Appointment" — C.B are literally
 * Chase Brighton's initials). This function only does the mechanical split;
 * the caller decides which role the left side plays.
 *
 * Deliberately loose on the right-hand side: real titles include odd values
 * like "7.A", not just letter-dot-letter, so this takes whatever text sits
 * between "<>" and the word "Telehealth" verbatim rather than assuming a
 * strict `[A-Z]\.[A-Z]` shape.
 */
export function parseGrowTherapyTitle(summary: string): {
	leftName: string | null;
	patientInitials: string | null;
} {
	const parts = summary.split("<>");
	if (parts.length < 2) return { leftName: null, patientInitials: null };

	const leftName = parts[0].trim() || null;
	// Re-join in case "<>" appears more than once — only the first split matters.
	const rest = parts.slice(1).join("<>");
	const beforeTelehealth = rest.match(/^(.*?)telehealth/i);
	const patientInitials = (beforeTelehealth ? beforeTelehealth[1] : rest).trim() || null;

	return { leftName, patientInitials };
}

/** "Chase Brighton" -> "cb"; used only to compare against a title's initials, never persisted or shown. */
function deriveInitials(fullName: string): string {
	return fullName
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0]?.toLowerCase() ?? "")
		.join("");
}

/** "C.B" / "7.A" / "cb" -> letters only, lowercased, for a tolerant comparison against deriveInitials(). */
function normalizeInitials(raw: string): string {
	return raw.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * True when the title's left-hand name is actually the PATIENT's own full
 * name rather than the provider's — confirmed real-world case: Grow Therapy
 * sends the patient THEIR OWN calendar invite titled
 * "Chase Brighton <> C.B Telehealth Appointment", where "C.B" are exactly
 * Chase Brighton's initials. Compare against a genuine provider title like
 * "Donna Rhodes <> S.N Telehealth Appointment" (D.R != S.N — Donna Rhodes
 * really is the provider there) or "Abbi Abrams <> O.B" (A.A != O.B) — both
 * correctly fail this check. Requires at least 2 derived letters so a
 * one-character/odd initials value (e.g. a lone "7") can never accidentally
 * match and misfire.
 */
export function titleLeftIsPatientName(leftName: string | null, patientInitials: string | null): boolean {
	if (!leftName || !patientInitials) return false;
	const derived = deriveInitials(leftName);
	if (derived.length < 2) return false;
	return derived === normalizeInitials(patientInitials);
}

/**
 * Best-effort scan of the event description for an explicitly labeled full
 * name ("Patient: John Smith" / "Client: John Smith"). Deliberately narrow:
 * grabbing the wrong line of free-text calendar description as a "name" is
 * worse than just falling back to initials, and per CLAUDE.md this app must
 * never go hunting through free text for more than it's explicitly told is
 * there — the raw description is never stored, only this narrow extraction.
 *
 * Two hardening steps here fix a real production bug: a patient card ended
 * up saved with the literal name "calendar-invite". Grow Therapy's own
 * description text is full of URLs like ".../client-login" and
 * "...?utm_source=client-calendar-invite" — the OLD regex accepted a bare
 * hyphen as a label separator, so "client-calendar-invite" parsed as
 * "client" + "-" + "calendar-invite" and got read as a labeled patient name.
 * Fix: (1) strip every URL out before searching at all, and (2) only accept
 * ":" as the separator — a real "Patient:"/"Client:" label always uses one,
 * URL slugs never do.
 */
export function extractFullPatientName(description: string): string | null {
	const withoutUrls = description.replace(/https?:\/\/[^\s<>"']+/gi, " ");
	const match = withoutUrls.match(/(?:patient|client)\s*(?:name)?\s*:\s*([A-Za-z][A-Za-z .'-]{1,80})/i);
	if (!match) return null;
	const name = match[1].trim();
	return name.length > 0 ? name : null;
}

/** node-ical hands attendee/organizer values back as "mailto:someone@example.com" (optionally with a display name in .params.CN) — this strips the scheme and validates it still looks like an address. */
function normalizeMailto(raw: string): string | null {
	if (!raw) return null;
	const stripped = raw.replace(/^mailto:/i, "").trim().toLowerCase();
	return stripped.includes("@") ? stripped : null;
}

/**
 * The patient's email, read straight from the calendar event's ATTENDEE
 * field — e.g. Grow Therapy's own patient-facing invite lists the patient as
 * the sole attendee ("selah7676@gmail.com"). Deliberately excludes the
 * organizer's own address (that's Grow Therapy's system/practice account,
 * never the patient) and returns the first remaining attendee otherwise.
 */
export function extractAttendeeEmail(event: VEvent): string | null {
	const organizerEmail = normalizeMailto(paramValueToString(event.organizer as ParameterValue | undefined));
	const raw = event.attendee as VEvent["attendee"];
	if (!raw) return null;
	const list = Array.isArray(raw) ? raw : [raw];
	for (const attendee of list) {
		const email = normalizeMailto(paramValueToString(attendee as ParameterValue | undefined));
		if (email && email !== organizerEmail) return email;
	}
	return null;
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

			if (!isGrowTherapyEvent(description, location)) continue;
			if (!start) continue;

			const { leftName, patientInitials } = parseGrowTherapyTitle(summary);
			// Explicit "Patient:"/"Client:" label wins when present (most
			// authoritative); otherwise fall back to the title's left side ONLY
			// when its initials match the patient's — see titleLeftIsPatientName.
			const regexFullName = description ? extractFullPatientName(description) : null;
			const titleIsPatientName = titleLeftIsPatientName(leftName, patientInitials);
			const fullPatientName = regexFullName ?? (titleIsPatientName ? leftName : null);
			// The left side is only a real provider name when it ISN'T actually
			// the patient's own name repeated — never hand the patient's name to
			// auto-assign as if it were a staff member to match against.
			const providerName = titleIsPatientName ? null : leftName;
			const patientEmail = extractAttendeeEmail(event);
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
				patientEmail,
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
