"use client"

import { useState } from "react"
import { ChevronDown, Folder, MoreVertical, Pencil, Share2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PasswordEntry } from "@/types"
import { PasswordEntryRow } from "./password-entry-row"

interface PasswordGroupSectionProps {
  title: string
  entryCount: number
  entries: PasswordEntry[]
  readOnly: boolean
  revealingId: string | null
  onReveal: (id: string) => Promise<string>
  onEditEntry?: (entry: PasswordEntry) => void
  onShareEntry?: (entry: PasswordEntry) => void
  onDeleteEntry?: (entry: PasswordEntry) => void
  // Group-level actions — undefined for the "Ungrouped" pseudo-section, which has none of these.
  onRenameGroup?: () => void
  onShareGroup?: () => void
  onDeleteGroup?: () => void
}

export function PasswordGroupSection({
  title,
  entryCount,
  entries,
  readOnly,
  revealingId,
  onReveal,
  onEditEntry,
  onShareEntry,
  onDeleteEntry,
  onRenameGroup,
  onShareGroup,
  onDeleteGroup,
}: PasswordGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const hasGroupActions = !!(onRenameGroup || onShareGroup || onDeleteGroup)

  return (
    // No overflow-hidden anywhere in this tree — the entry rows' 3-dot dropdown
    // AND this header's own group-level 3-dot dropdown are both absolutely
    // positioned and need to pop out past their containers' edges. A div's own
    // background already respects its own rounded corners without
    // overflow-hidden, so dropping it here doesn't affect the header's look —
    // it only stops the header from clipping its own dropdown menu.
    <div className="rounded-xl border border-[#E5E7EB] bg-white">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E5E7EB] rounded-t-xl">
        <button onClick={() => setCollapsed((v) => !v)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <ChevronDown className={cn("w-3.5 h-3.5 text-[#6B7280] transition-transform shrink-0", collapsed && "-rotate-90")} />
          <Folder className="w-4 h-4 text-[#036638] shrink-0" />
          <h4 className="text-xs font-bold uppercase tracking-wide text-[#374151] truncate">{title}</h4>
          <span className="text-[10px] text-[#9CA3AF] shrink-0">
            {entryCount} password{entryCount !== 1 ? "s" : ""}
          </span>
        </button>

        {hasGroupActions && (
          <div className="relative shrink-0">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1 rounded-lg hover:bg-gray-200 text-[#6B7280]">
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-20 w-40 bg-white border border-[#E5E7EB] rounded-xl shadow-lg overflow-hidden py-1">
                  {onRenameGroup && (
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        onRenameGroup()
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Rename
                    </button>
                  )}
                  {onShareGroup && (
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        onShareGroup()
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
                    >
                      <Share2 className="w-3.5 h-3.5" /> Share access
                    </button>
                  )}
                  {onDeleteGroup && (
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        onDeleteGroup()
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete group
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="divide-y divide-[#F3F4F6]">
          {entries.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] italic px-4 py-3">No passwords in this group yet.</p>
          ) : (
            entries.map((entry) => (
              <PasswordEntryRow
                key={entry.id}
                entry={entry}
                readOnly={readOnly}
                isRevealing={revealingId === entry.id}
                onReveal={() => onReveal(entry.id)}
                onEdit={onEditEntry ? () => onEditEntry(entry) : undefined}
                onShare={onShareEntry ? () => onShareEntry(entry) : undefined}
                onDeleteRequest={onDeleteEntry ? () => onDeleteEntry(entry) : undefined}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
