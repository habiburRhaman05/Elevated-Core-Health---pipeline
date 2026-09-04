"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface RenameModalProps {
  open: boolean
  title: string
  initialValue: string
  isSaving: boolean
  onCancel: () => void
  onSave: (value: string) => void
}

/**
 * Shared rename dialog — used for both folders and documents (same shape,
 * different target). The caller must pass a `key` that changes with the
 * target item (e.g. `key={renamingFolder?.id}`) so React remounts this
 * component — and therefore re-seeds `value` from a fresh `initialValue` —
 * instead of us syncing state from a prop inside an effect.
 */
export function RenameModal({ open, title, initialValue, isSaving, onCancel, onSave }: RenameModalProps) {
  const [value, setValue] = useState(initialValue)

  if (!open) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-bold text-[#1A1B1E] mb-3">{title}</h3>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && onSave(value.trim())}
          className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#036638]/30 mb-4"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!value.trim() || isSaving}
            onClick={() => onSave(value.trim())}
            className="bg-[#036638] hover:bg-[#025030] text-white"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
