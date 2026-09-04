"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface GroupFormModalProps {
  open: boolean
  title: string
  initialValue: string
  isSaving: boolean
  onCancel: () => void
  onSave: (name: string) => void
}

/** Caller passes `key` tied to the target group's id (or "create") so this remounts fresh per open — see entry-form-modal.tsx's doc comment for why. */
export function GroupFormModal({ open, title, initialValue, isSaving, onCancel, onSave }: GroupFormModalProps) {
  const [name, setName] = useState(initialValue)

  if (!open) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-bold text-[#1A1B1E] mb-3">{title}</h3>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name.trim())}
          placeholder="Group name"
          className="mb-4"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || isSaving}
            onClick={() => onSave(name.trim())}
            className="bg-[#036638] hover:bg-[#025030] text-white"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
