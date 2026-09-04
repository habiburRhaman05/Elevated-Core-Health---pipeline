import type { PasswordEntry } from "@/types"

/** groupId === null bucket for the "Ungrouped" section. */
export type GroupedEntries = Record<string, PasswordEntry[]>

export function groupEntriesByGroup(entries: PasswordEntry[]): GroupedEntries {
  return entries.reduce<GroupedEntries>((acc, entry) => {
    const key = entry.group?.id ?? "ungrouped"
    acc[key] = acc[key] ? [...acc[key], entry] : [entry]
    return acc
  }, {})
}
