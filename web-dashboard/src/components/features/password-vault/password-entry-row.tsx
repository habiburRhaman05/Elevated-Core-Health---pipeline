"use client"

import { useState } from "react"
import { Copy, Eye, EyeOff, KeyRound, Loader2, MoreVertical, Pencil, Share2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { PasswordEntry } from "@/types"
import { cn } from "@/lib/utils"

interface PasswordEntryRowProps {
  entry: PasswordEntry
  readOnly: boolean
  isRevealing: boolean
  onReveal: () => Promise<string>
  onEdit?: () => void
  onShare?: () => void
  onDeleteRequest?: () => void
}

/**
 * Shared between the admin manager and the VA's read-only view. The
 * decrypted password is never fetched until the eye icon is actually
 * clicked — onReveal() hits a fresh, audited backend call every time — and
 * it's held only in this row's own local state, never in the query cache.
 */
export function PasswordEntryRow({ entry, readOnly, isRevealing, onReveal, onEdit, onShare, onDeleteRequest }: PasswordEntryRowProps) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleToggleReveal = async () => {
    if (revealed) {
      setRevealed(null)
      return
    }
    try {
      const password = await onReveal()
      setRevealed(password)
    } catch {
      // Toasted by the mutation hook already.
    }
  }

  const handleCopy = async () => {
    try {
      const password = revealed ?? (await onReveal())
      await navigator.clipboard.writeText(password)
      toast.success("Password copied to clipboard")
    } catch {
      // Toasted by the mutation hook already.
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#F9FAFB] transition-colors">
      <div className="w-8 h-8 rounded-lg bg-[#EBF7EC] flex items-center justify-center shrink-0">
        <KeyRound className="w-4 h-4 text-[#036638]" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#1A1B1E] truncate">{entry.name}</p>
        {entry.username && <p className="text-xs text-[#6B7280] truncate">{entry.username}</p>}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <code className="text-xs font-mono text-[#374151] bg-[#F4F5F7] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 min-w-[110px] text-center">
          {isRevealing ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : revealed ? revealed : "••••••••••"}
        </code>
        <button
          onClick={handleToggleReveal}
          disabled={isRevealing}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-[#6B7280] hover:text-[#036638] transition-colors"
          title={revealed ? "Hide password" : "Reveal password"}
        >
          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          onClick={handleCopy}
          disabled={isRevealing}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-[#6B7280] hover:text-[#036638] transition-colors"
          title="Copy password"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>

      {!readOnly && entry.access && (
        <div className="hidden sm:flex items-center gap-1 shrink-0 max-w-[140px]">
          {entry.access.length > 0 ? (
            <span
              className="text-[10px] font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-600 truncate"
              title={entry.access.map((u) => u.name).join(", ")}
            >
              {entry.access.length === 1 ? entry.access[0].name : `${entry.access.length} shared`}
            </span>
          ) : (
            <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-400">Not shared</span>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="relative shrink-0">
          <button onClick={() => setMenuOpen((v) => !v)} className="p-1 rounded-lg hover:bg-gray-100 text-[#6B7280]">
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-40 bg-white border border-[#E5E7EB] rounded-xl shadow-lg overflow-hidden py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onEdit?.()
                  }}
                  className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]")}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onShare?.()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share access
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onDeleteRequest?.()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
