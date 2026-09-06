import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * "grow_therapy" -> "Grow Therapy". `patient.source`/`bookingPlatform` are
 * raw snake_case vendor identifiers (manual/optimantra/klarity/grow_therapy/
 * import/...) — a CSS `capitalize` alone only capitalizes the very first
 * character of the whole string, so a multi-word value like "grow_therapy"
 * rendered that way reads as "Grow_therapy" with a literal underscore.
 */
export function formatSourceLabel(value: string | null | undefined, fallback = "Manual"): string {
  if (!value) return fallback
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ")
}

/** Local initials fallback for when a remote avatar image can't be loaded. */
export function getInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

/** Compact relative time, e.g. "3m ago" / "2h ago" / "5d ago". */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  // Under an hour: show the actual minute count instead of a vague "<1h ago".
  if (minutes < 60) return `${Math.max(minutes, 0)}m ago`
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Messaging date/time formatters
//
// Deliberately separate from timeAgo() above rather than overloading it: the
// messages UI needs three *different* shapes of the same instant (bubble
// time, thread date separator, inbox row), none of which are relative.
// ---------------------------------------------------------------------------

/**
 * Intl inserts a narrow no-break space (U+202F) before AM/PM in newer
 * runtimes, which renders as a stray gap and breaks naive string matching.
 * Normalize it to a plain space everywhere we format a time.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/\u202f/g, " ")
}

function timePart(date: Date): string {
  return normalizeSpaces(date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

/** Message bubble timestamp — time only, lowercase meridiem: "3:39 am". */
export function formatMessageTimestamp(dateStr: string): string {
  return timePart(new Date(dateStr)).toLowerCase()
}

/**
 * Date separator shown between message groups whenever the day changes:
 *   today            -> "Today, 3:06 am"
 *   this year        -> "Friday, Aug 21, 3:32 am"
 *   a previous year  -> "Friday, Aug 21, 2025, 3:32 am"
 */
export function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const time = timePart(date).toLowerCase()

  if (isSameDay(date, now)) return `Today, ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, yesterday)) return `Yesterday, ${time}`

  const datePart = normalizeSpaces(
    date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    }),
  )
  return `${datePart}, ${time}`
}

/**
 * Conversation list row timestamp:
 *   today           -> "3:08 AM"
 *   this year       -> "Aug 22"
 *   a previous year -> "Aug 22, 2025"
 */
export function formatConversationListTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  if (isSameDay(date, now)) return timePart(date)
  return normalizeSpaces(
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    }),
  )
}

/**
 * Stable per-conversation avatar tint so the inbox reads like the reference
 * (varied colors) instead of a wall of identical green circles. Keyed by id
 * so a given conversation always gets the same color across reloads.
 */
const AVATAR_PALETTE = [
  { bg: "bg-[#0EA5A5]", text: "text-white" },
  { bg: "bg-[#7C3AED]", text: "text-white" },
  { bg: "bg-[#F97316]", text: "text-white" },
  { bg: "bg-[#036638]", text: "text-white" },
  { bg: "bg-[#2563EB]", text: "text-white" },
  { bg: "bg-[#DB2777]", text: "text-white" },
  { bg: "bg-[#CA8A04]", text: "text-white" },
] as const

export function avatarColor(key: string): { bg: string; text: string } {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}
