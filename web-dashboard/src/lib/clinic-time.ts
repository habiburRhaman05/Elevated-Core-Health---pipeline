/**
 * Every appointment date/time in the app must render in the correct SOURCE
 * timezone, not the viewer's browser/OS timezone. Without this, `new
 * Date(iso)` combined with `.toLocaleString()`/`.getHours()` (no `timeZone`
 * option) reads the machine's own system clock — so the same appointment
 * shows a different hour, and sometimes a different CALENDAR DAY, depending on
 * where the person viewing the board happens to be.
 *
 * Two timezones are tracked, per patient source:
 *   - KLARITY_TIMEZONE  — confirmed from Klarity's own practice settings
 *     (Calendar → Settings → Availability → Time zone), currently
 *     "(UTC-04:00) Eastern Time Zone". If that setting is ever changed in
 *     Klarity, update ONLY this constant.
 *   - CLINIC_TIMEZONE   — used for every other source (manual entry, the
 *     Optimantra/Make.com webhook, CSV import, ...). Also Eastern today, but
 *     tracked separately so the two can diverge without touching each other.
 *
 * `resolveSourceTimezone` / the `formatPatient*` and `*Patient*` helpers below
 * pick the right one from a patient's `bookingPlatform`. Prefer those over the
 * bare `formatClinic*`/`toClinic*` functions at any call site that has a
 * patient (or its `bookingPlatform`) in scope.
 *
 * A NOTE ON WHAT DOES AND DOESN'T LIVE HERE: this file controls how OUR OWN
 * UI renders an instant. It has no way to affect how a separate, third-party
 * product (Klarity's own web dashboard) renders that same instant in ITS OWN
 * UI — there is no code path between the two. If our display and Klarity's
 * display ever disagree for the same appointment, the fix is never here; it
 * means Klarity's dashboard is reading a different timezone than its own
 * configured practice setting (e.g. rendering the viewer's browser-local time
 * instead) — confirmed as the actual explanation the one time this came up,
 * by checking Klarity's own Settings → Availability → Time zone page.
 */
export const KLARITY_TIMEZONE = "America/New_York"
export const CLINIC_TIMEZONE = "America/New_York"

/** Picks the correct timezone for a patient, by where their appointment data originated. */
export function resolveSourceTimezone(bookingPlatform?: string | null): string {
  return bookingPlatform === "klarity" ? KLARITY_TIMEZONE : CLINIC_TIMEZONE
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * Reads an instant's wall-clock components as they appear in the given IANA
 * timezone. `hourCycle: "h23"` (rather than `hour12: false`) is deliberate:
 * some older ICU builds report midnight as hour "24" under `hour12: false`,
 * which would silently corrupt every other calculation in this file if it
 * ever came back on a deploy target with an older ICU. `hourCycle: "h23"`
 * pins the 0–23 format unambiguously, so there's no "24" case to guard
 * against — no modulo, no runtime workaround needed.
 */
function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0"
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  }
}

/** `date.toLocaleTimeString(...)`, forced to the given timezone (default: CLINIC_TIMEZONE). */
export function formatClinicTime(date: Date, opts: Intl.DateTimeFormatOptions = {}, timeZone: string = CLINIC_TIMEZONE): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...opts, timeZone })
}

/** `date.toLocaleDateString(...)`, forced to the given timezone (default: CLINIC_TIMEZONE). */
export function formatClinicDate(date: Date, opts: Intl.DateTimeFormatOptions = {}, timeZone: string = CLINIC_TIMEZONE): string {
  return date.toLocaleDateString("en-US", { ...opts, timeZone })
}

/** `date.toLocaleString(...)`, forced to the given timezone (default: CLINIC_TIMEZONE). */
export function formatClinicDateTime(date: Date, opts: Intl.DateTimeFormatOptions = {}, timeZone: string = CLINIC_TIMEZONE): string {
  return date.toLocaleString("en-US", { ...opts, timeZone })
}

/**
 * Packs an instant's wall-clock components (in the given timezone) into a
 * plain Date constructed from LOCAL (browser) components. That Date's own
 * `.getHours()`/`.getDate()`/etc. — and anything built on them, like
 * `date-fns`'s `format()` or FullCalendar's own day-bucketing — then reflect
 * that timezone's wall clock for every viewer, regardless of their own
 * machine's timezone. This is a display trick only: never use the returned
 * Date for arithmetic against a real UTC instant (adding hours to it,
 * comparing it to `new Date()`, etc.) — it is not a real point in time, only a
 * stand-in whose calendar fields happen to match the target zone.
 */
export function toClinicWallClock(date: Date, timeZone: string = CLINIC_TIMEZONE): Date {
  const p = getZonedParts(date, timeZone)
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

/**
 * A naive "YYYY-MM-DDTHH:mm:ss" string (no trailing `Z`, no offset) holding
 * the given timezone's wall-clock time for this instant. FullCalendar
 * interprets a string with no zone/offset as literal local numbers to display
 * as-is — it does not re-interpret or shift them — so handing it these
 * instead of a raw UTC ISO string is what makes the calendar show every
 * appointment on its correct local day and hour for every viewer, everywhere.
 */
export function toClinicNaiveIsoString(date: Date, timeZone: string = CLINIC_TIMEZONE): string {
  const wall = toClinicWallClock(date, timeZone)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}T${pad(wall.getHours())}:${pad(wall.getMinutes())}:${pad(wall.getSeconds())}`
}

/**
 * The value to put into a `<input type="datetime-local">` so it PRE-FILLS
 * with the given timezone's wall-clock time for this instant, no matter the
 * viewer's own machine timezone. Pair with `fromClinicWallClockInput` when
 * reading the value back out — using one without the other reintroduces the
 * exact bug this file exists to fix, just in the edit form instead of a
 * display.
 */
export function toClinicDatetimeLocalValue(date: Date, timeZone: string = CLINIC_TIMEZONE): string {
  return toClinicNaiveIsoString(date, timeZone).slice(0, 16) // "YYYY-MM-DDTHH:mm", what the input expects
}

/**
 * Inverse of the above: takes a `<input type="datetime-local">` value (or any
 * "YYYY-MM-DDTHH:mm[:ss]" string) whose digits are meant as wall-clock time IN
 * THE GIVEN TIMEZONE — e.g. a VA typing "2:00 PM" meaning 2:00 PM in that
 * zone, regardless of what timezone their own computer happens to be set to —
 * and returns the real UTC instant it corresponds to, correct across DST.
 *
 * Algorithm: read the input digits as if they were UTC (a throwaway guess),
 * check what that timezone's wall-clock reading of the guessed instant is,
 * then correct by however far off that reading was from the digits we
 * actually want. One correction pass is exact except within the ~1 hour a
 * real clock is ambiguous/skipped during a DST transition — a real, inherent
 * ambiguity in any calendar tool, not something this function can resolve.
 */
export function fromClinicWallClockInput(input: string, timeZone: string = CLINIC_TIMEZONE): Date {
  const [datePart, timePart = "00:00"] = input.split("T")
  const [year, month, day] = datePart.split("-").map(Number)
  const [hourStr, minuteStr, secondStr = "0"] = timePart.split(":")
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const second = Number(secondStr)

  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, second)
  const asRead = getZonedParts(new Date(utcGuessMs), timeZone)
  const asReadAsUtcMs = Date.UTC(asRead.year, asRead.month - 1, asRead.day, asRead.hour, asRead.minute, asRead.second)

  return new Date(utcGuessMs + (utcGuessMs - asReadAsUtcMs))
}

// ---------------------------------------------------------------------------
// Patient-aware wrappers — prefer these at any call site that has a patient
// (or its bookingPlatform) in scope. They resolve the correct timezone via
// resolveSourceTimezone so the UI renders Klarity-sourced appointments in
// Klarity's configured zone and everything else in the clinic's, without each
// call site needing to know which zone applies.
// ---------------------------------------------------------------------------

export function formatPatientDate(bookingPlatform: string | null | undefined, date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return formatClinicDate(date, opts, resolveSourceTimezone(bookingPlatform))
}

export function formatPatientTime(bookingPlatform: string | null | undefined, date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return formatClinicTime(date, opts, resolveSourceTimezone(bookingPlatform))
}

export function formatPatientDateTime(bookingPlatform: string | null | undefined, date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return formatClinicDateTime(date, opts, resolveSourceTimezone(bookingPlatform))
}

export function toPatientNaiveIsoString(bookingPlatform: string | null | undefined, date: Date): string {
  return toClinicNaiveIsoString(date, resolveSourceTimezone(bookingPlatform))
}

export function toPatientWallClock(bookingPlatform: string | null | undefined, date: Date): Date {
  return toClinicWallClock(date, resolveSourceTimezone(bookingPlatform))
}

export function toPatientDatetimeLocalValue(bookingPlatform: string | null | undefined, date: Date): string {
  return toClinicDatetimeLocalValue(date, resolveSourceTimezone(bookingPlatform))
}

export function fromPatientWallClockInput(bookingPlatform: string | null | undefined, input: string): Date {
  return fromClinicWallClockInput(input, resolveSourceTimezone(bookingPlatform))
}
