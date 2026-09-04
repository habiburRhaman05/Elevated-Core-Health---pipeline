"use client"

import { useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { useMyPasswordEntries, useRevealMyPasswordEntry } from "@/hooks/query/usePasswordVault"
import { PasswordGroupSection } from "./password-group-section"
import { groupEntriesByGroup } from "./types"

/**
 * VA view — read-only, and the entries here are ONLY ever what
 * GET /password-vault/my-entries actually returned (server-filtered to this
 * VA's own access grants). There is no larger list fetched anywhere on this
 * page that gets narrowed down client-side.
 */
export function MyPasswordVault() {
  const { data: entries, isLoading } = useMyPasswordEntries()
  const revealEntry = useRevealMyPasswordEntry()
  const [revealingId, setRevealingId] = useState<string | null>(null)

  const grouped = groupEntriesByGroup(entries ?? [])
  const groupSections = Object.entries(grouped).filter(([key]) => key !== "ungrouped")
  const ungrouped = grouped.ungrouped ?? []

  const handleReveal = async (id: string): Promise<string> => {
    setRevealingId(id)
    try {
      return await revealEntry.mutateAsync(id)
    } finally {
      setRevealingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-[#EBF7EC] flex items-center justify-center">
          <KeyRound className="w-4.5 h-4.5 text-[#036638]" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[#1A1B1E]">Password Vault</h3>
          <p className="text-xs text-[#6B7280]">Passwords shared with you</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#036638] animate-spin" />
        </div>
      ) : (entries ?? []).length === 0 ? (
        <div className="text-center py-16">
          <KeyRound className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400 italic">No passwords have been shared with you yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupSections.map(([groupId, groupEntries]) => (
            <PasswordGroupSection
              key={groupId}
              title={groupEntries[0]?.group?.name ?? "Group"}
              entryCount={groupEntries.length}
              entries={groupEntries}
              readOnly
              revealingId={revealingId}
              onReveal={handleReveal}
            />
          ))}

          {ungrouped.length > 0 && (
            <PasswordGroupSection
              title="Ungrouped"
              entryCount={ungrouped.length}
              entries={ungrouped}
              readOnly
              revealingId={revealingId}
              onReveal={handleReveal}
            />
          )}
        </div>
      )}
    </div>
  )
}
