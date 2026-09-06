import Groq from "groq-sdk";

import { extractFullPatientName, parseGrowTherapyTitle } from "@/lib/growTherapyCalendar";
import { env } from "@/utils/envConfig";
import { logger } from "@/utils/logger";

/**
 * Isolated, three-layer patient-name parser for .ics calendar polling (Grow
 * Therapy today, Headway later if a feed is ever added). This module is the
 * single answer to the classic bug where a calendar title hides the patient
 * behind initials ("Abbi Abrams <> O.B Telehealth Appointment") and those
 * initials get saved as the patient's name.
 *
 * Resolution order — most specific first, never initials while a real full
 * name is available:
 *
 *   1. TITLE SPLIT — pull `providerName` and `patientInitials` from the
 *      "Provider <> Initials Telehealth" title shape.
 *   2. DESCRIPTION REGEX — scan the event body for an explicitly labeled
 *      "Patient:" / "Patient Name:" / "Client:" / "Client Name:" value.
 *   3. GROQ AI — only when (2) found nothing AND a description exists: ask an
 *      LLM to locate the patient's full name in the free text and return it as
 *      strict JSON. Opt-in via GROQ_API_KEY; never throws, never crashes the
 *      poll — on any failure it simply returns null and the caller falls back
 *      to the title initials.
 *
 * The raw description body is never persisted anywhere — it is read in-memory
 * only, and only the extracted name reaches the database.
 */

/** Bounds both cost and PHI exposure: Groq never needs more than the first few KB of a calendar note. */
const MAX_DESCRIPTION_CHARS = 3_000;
const MAX_TITLE_CHARS = 500;

/** The model must reply with ONLY this shape — enforced by prompt + a defensive parse below. */
const SYSTEM_PROMPT = [
	"You are a data-extraction assistant for a therapy practice's operations tool.",
	"Given a calendar appointment event title and its description, find the FULL NAME of the PATIENT — the person attending the appointment.",
	"Grow Therapy and Headway calendars hide the patient's name in the title behind initials (e.g. \"O.B\") for privacy, but usually include the real full name somewhere in the description, often after a label such as \"Patient:\", \"Patient Name:\", \"Client:\", or \"Client Name:\".",
	"Rules:",
	"1. Return ONLY the patient's full name.",
	"2. Never return a provider/therapist name, a staff/admin name, the practice name, an email, or the initials placeholder from the title.",
	"3. If no real full patient name exists anywhere, return null.",
	'4. Output nothing but a single JSON object shaped exactly like {"patientFullName": "Full Name Here"} — or {"patientFullName": null} when there is no name.',
].join(" ");

// Lazy, cached SDK instance — created only on the first actual AI call so the
// module stays side-effect free until GROQ_API_KEY is present and needed.
let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
	if (!env.GROQ_API_KEY) return null;
	if (!groqClient) {
		// 15s cap keeps a slow/absent model from stalling a whole poll run;
		// maxRetries 1 (SDK default is 2) bounds cost when Groq is degraded.
		groqClient = new Groq({ apiKey: env.GROQ_API_KEY, timeout: 15_000, maxRetries: 1 });
	}
	return groqClient;
}

// ---------------------------------------------------------------------------
// Layer 1 + 2 — pure, synchronous, no network. Reuses the parser primitives
// from growTherapyCalendar.ts so there is exactly one copy of each regex.
// ---------------------------------------------------------------------------

export interface AppointmentMetadata {
	/** Text before "<>" in the title, e.g. "Abbi Abrams". */
	providerName: string | null;
	/** Text between "<>" and "Telehealth", e.g. "O.B" — the privacy placeholder, never the saved name unless nothing better exists. */
	patientInitials: string | null;
	/** Regex-extracted, explicitly labeled full name from the description (layer 2), or null. */
	patientFullName: string | null;
}

/**
 * Layer 1 (title split) + Layer 2 (description regex) as one synchronous call.
 * Returns the fields a caller needs to decide whether the more expensive
 * Layer 3 (Groq) is worth attempting.
 */
export function extractAppointmentMetadata(eventSummary: string, eventDescription: string): AppointmentMetadata {
	const { providerName, patientInitials } = parseGrowTherapyTitle(eventSummary);
	const patientFullName = eventDescription ? extractFullPatientName(eventDescription) : null;
	return { providerName, patientInitials, patientFullName };
}

// ---------------------------------------------------------------------------
// Layer 3 — Groq LLM fallback. Async + external API, so it is only invoked by
// callers that are about to WRITE a new patient, never on every poll tick.
// ---------------------------------------------------------------------------

/** "O.B" / "O.B." / "ob" → "ob"; used to reject a model answer that merely echoes the title placeholder. */
function lettersOnly(s: string): string {
	return s.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Gate the model's answer before it is trusted as a patient name: printable
 * letters/spaces/punctuation only, sane length, at least two space-separated
 * words (a bare initials block like "O.B" or "T.T" never contains a space),
 * and not verbatim the initials from the title.
 */
function isUsableFullName(candidate: string, patientInitials: string | null | undefined): boolean {
	const trimmed = candidate.trim();
	if (trimmed.length < 3 || trimmed.length > 100) return false;
	if (!/^[A-Za-z][A-Za-z' .-]{1,98}[A-Za-z.]$/.test(trimmed)) return false;
	if (!trimmed.includes(" ")) return false;
	if (patientInitials && lettersOnly(trimmed) === lettersOnly(patientInitials)) return false;
	// At least two letters total and no single-letter tokens filling the name ("J Smith" ok, "J S" not worth trusting).
	const words = trimmed.split(/\s+/);
	if (words.length < 2 || words.some((w) => w.replace(/[^a-z]/gi, "").length === 0)) return false;
	return true;
}

/**
 * Guard against the LLM INVENTING a plausible-sounding name — the real risk
 * when the title initials match a famous person ("O.B" → "Orlando Bloom").
 * Every significant word of the candidate must literally appear somewhere in
 * the description text, or the answer is treated as a hallucination.
 */
function nameWordsPresentIn(candidate: string, description: string): boolean {
	const words = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z\s]/g, " ")
			.split(/\s+/)
			.filter((w) => w.length >= 2);
	const haystack = new Set(words(description));
	const needle = words(candidate);
	return needle.length > 0 && needle.every((w) => haystack.has(w));
}

/** Model output is required to be JSON; parse it strictly first, then rescue a bare `"patientFullName": "..."` fragment. */
function parseNameFromModelOutput(raw: string): string | null {
	const trimmed = raw.trim();
	try {
		const parsed = JSON.parse(trimmed) as { patientFullName?: unknown };
		if (typeof parsed.patientFullName === "string") return parsed.patientFullName.trim() || null;
		return null;
	} catch {
		// fall through to the fragment rescue
	}
	const fragment = trimmed.match(/"patientFullName"\s*:\s*"([^"]+)"/);
	return fragment ? fragment[1].trim() : null;
}

/**
 * Layer 3 / ultimate fix: ask Groq to locate the patient's full name inside
 * the event's free-text description after the regex layer came up empty.
 *
 * Failure is never fatal by design — every exit path short of a usable answer
 * returns null (missing key, network error, unparseable/untrustworthy reply),
 * and the caller then falls back to `patientInitials`, so the polling loop can
 * never be crashed or stalled by the AI layer.
 */
export async function extractPatientFullNameWithGroq(
	eventSummary: string,
	eventDescription: string,
	patientInitials: string | null | undefined,
): Promise<string | null> {
	const description = (eventDescription ?? "").trim();
	if (!description) return null;

	const client = getGroqClient();
	if (!client) {
		logger.warn(
			"GROQ_API_KEY is not set — skipping AI patient-name fallback for a Grow Therapy event with no labeled name in its description",
		);
		return null;
	}

	const titleSnippet = (eventSummary ?? "").slice(0, MAX_TITLE_CHARS);
	const descriptionSnippet = description.slice(0, MAX_DESCRIPTION_CHARS);

	try {
		const completion = await client.chat.completions.create({
			model: env.GROQ_MODEL,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{
					role: "user",
					content: `Event title:\n${titleSnippet}\n\nEvent description:\n${descriptionSnippet}`,
				},
			],
			temperature: 0,
			max_tokens: 120,
		});

		const raw = completion.choices[0]?.message?.content ?? "";
		const candidate = parseNameFromModelOutput(raw);
		// Deliberately no `raw` in this log line — the model output could echo a
		// patient name back, and patient names never belong in logs.
		if (!candidate) {
			logger.warn("Groq patient-name fallback returned no usable name");
			return null;
		}
		if (!isUsableFullName(candidate, patientInitials)) {
			logger.warn({ candidate }, "Groq patient-name fallback returned an unusable name — discarding");
			return null;
		}
		// Containment check — a name that does not appear in the description is a
		// hallucination (see nameWordsPresentIn), and hallucinated patient names
		// are worse than the honest initials fallback.
		if (!nameWordsPresentIn(candidate, description)) {
			logger.warn({ candidate }, "Groq patient-name fallback name not found in description — treating as hallucination and discarding");
			return null;
		}
		return candidate;
	} catch (err) {
		// Network failure, model decommissioned, rate limit, malformed JSON…
		// none of these should ever surface past this boundary.
		logger.error({ err, model: env.GROQ_MODEL }, "Groq patient-name fallback failed — using title initials instead");
		return null;
	}
}
