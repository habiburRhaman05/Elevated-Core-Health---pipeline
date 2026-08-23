/**
 * Phone number helpers for SMS messaging. Patient.phone is free-form (however
 * a VA typed it, or however Klarity/Optimantra formatted it in the intake
 * webhook) — never assume it's already clean E.164. SmsConversation.phoneNumber
 * IS always stored E.164-normalized (see quo.ts / messaging.service.ts), so any
 * comparison against a Patient's phone must normalize both sides first.
 */

/**
 * Normalizes a US/Canada (NANP) number to E.164 (+1XXXXXXXXXX). Returns null
 * for anything that isn't a plausible 10-digit (or 11-digit-with-leading-1)
 * NANP number — international numbers are out of scope for this phase (the
 * clinic's business line and its patients are US-based).
 */
export function normalizeE164(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const digits = raw.replace(/\D/g, "");
	const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
	if (local.length !== 10) return null;
	return `+1${local}`;
}

/** Last 10 digits only, no formatting — used for loose matching against
 * however a patient's phone happens to be stored (not guaranteed E.164). */
export function phoneDigits10(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const digits = raw.replace(/\D/g, "");
	const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
	return local.length === 10 ? local : null;
}
