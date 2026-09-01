/**
 * Every appointment date/time in the app must render as the CLINIC's local
 * time, not the viewer's browser/OS timezone. Without this, `new Date(iso)`
 * combined with `.toLocaleString()`/`.getHours()` (no `timeZone` option) reads
 * the machine's own system clock — so the same appointment shows a different
 * hour, and sometimes a different CALENDAR DAY, depending on where the person
 * viewing the board happens to be. That's what caused an 11:30 PM appointment
 * to render on the next day for a viewer east of the clinic's timezone, and
 * what caused the SAME patient's appointment to show two different times
 * between the calendar and the patient card once only one of them was fixed.
 *
 * ASSUMPTION — confirm with the client: set to US Eastern as a reasonable
 * default for a US-based clinic. If the clinic is actually in another zone,
 * change ONLY this constant; every call site below reads from it.
 */
export const CLINIC_TIMEZONE = "America/New_York"

interface ClinicParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Reads an instant's wall-clock components as they appear IN THE CLINIC'S TIMEZONE. */
function getClinicParts(date: Date): ClinicParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0"
  // Some engines report midnight as hour "24" with hour12:false.
  const hour = Number(get("hour")) % 24
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
  }
}

/** `date.toLocaleTimeString(...)`, forced to the clinic's timezone. */
export function formatClinicTime(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...opts,
    timeZone: CLINIC_TIMEZONE,
  })
}

/** `date.toLocaleDateString(...)`, forced to the clinic's timezone. */
export function formatClinicDate(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return date.toLocaleDateString("en-US", { ...opts, timeZone: CLINIC_TIMEZONE })
}

/** `date.toLocaleString(...)`, forced to the clinic's timezone. */
export function formatClinicDateTime(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return date.toLocaleString("en-US", { ...opts, timeZone: CLINIC_TIMEZONE })
}

/**
 * Packs an instant's clinic-local wall-clock components into a plain Date
 * constructed from LOCAL (browser) components. That Date's own
 * `.getHours()`/`.getDate()`/etc. — and anything built on them, like
 * `date-fns`'s `format()` or FullCalendar's own day-bucketing — then reflect
 * the CLINIC's wall clock for every viewer, regardless of their own machine's
 * timezone. This is a display trick only: never use the returned Date for
 * arithmetic against a real UTC instant (adding hours to it, comparing it to
 * `new Date()`, etc.) — it is not a real point in time, only a stand-in whose
 * calendar fields happen to match the clinic's.
 */
export function toClinicWallClock(date: Date): Date {
  const p = getClinicParts(date)
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

/**
 * A naive "YYYY-MM-DDTHH:mm:ss" string (no trailing `Z`, no offset) holding the
 * clinic's wall-clock time for this instant. FullCalendar interprets a string
 * with no zone/offset as literal local numbers to display as-is — it does not
 * re-interpret or shift them — so handing it these instead of a raw UTC ISO
 * string is what makes the calendar show every appointment on its correct
 * clinic-local day and hour for every viewer, everywhere.
 */
export function toClinicNaiveIsoString(date: Date): string {
  const wall = toClinicWallClock(date)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${wall.getFullYear()}-${pad(wall.getMonth() + 1)}-${pad(wall.getDate())}T${pad(wall.getHours())}:${pad(wall.getMinutes())}:${pad(wall.getSeconds())}`
}

/**
 * The value to put into a `<input type="datetime-local">` so it PRE-FILLS with
 * the clinic's wall-clock time for this instant, no matter the viewer's own
 * machine timezone. Pair with `fromClinicWallClockInput` when reading the
 * value back out — using one without the other reintroduces the exact bug
 * this file exists to fix, just in the edit form instead of a display.
 */
export function toClinicDatetimeLocalValue(date: Date): string {
  return toClinicNaiveIsoString(date).slice(0, 16) // "YYYY-MM-DDTHH:mm", what the input expects
}

/**
 * Inverse of the above: takes a `<input type="datetime-local">` value (or any
 * "YYYY-MM-DDTHH:mm[:ss]" string) whose digits are meant as the CLINIC's local
 * wall-clock time — e.g. a VA typing "2:00 PM" meaning the clinic's 2:00 PM,
 * regardless of what timezone their own computer happens to be set to — and
 * returns the real UTC instant it corresponds to, correct across DST.
 *
 * Algorithm: read the input digits as if they were UTC (a throwaway guess),
 * check what clinic-local wall-clock that guessed instant displays as, then
 * correct by however far off that reading was from the digits we actually
 * want. One correction pass is exact except within the ~1 hour a real
 * clock is ambiguous/skipped during a DST transition — a real, inherent
 * ambiguity in any calendar tool, not something this function can resolve.
 */
export function fromClinicWallClockInput(input: string): Date {
  const [datePart, timePart = "00:00"] = input.split("T")
  const [year, month, day] = datePart.split("-").map(Number)
  const [hourStr, minuteStr, secondStr = "0"] = timePart.split(":")
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const second = Number(secondStr)

  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, second)
  const asReadInClinic = getClinicParts(new Date(utcGuessMs))
  const asReadInClinicAsUtcMs = Date.UTC(
    asReadInClinic.year,
    asReadInClinic.month - 1,
    asReadInClinic.day,
    asReadInClinic.hour,
    asReadInClinic.minute,
    asReadInClinic.second,
  )

  return new Date(utcGuessMs + (utcGuessMs - asReadInClinicAsUtcMs))
}
