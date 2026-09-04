"use client"

import { useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useListVas } from "@/hooks/query/usePatients"

interface AccessModalProps {
  open: boolean
  title: string
  description: string
  initialUserIds: string[]
  isSaving: boolean
  onCancel: () => void
  onSave: (userIds: string[]) => void
}

/**
 * Shared "which VAs can see this" checkbox picker — used both for a whole
 * group (grants every entry inside it) and for one specific entry. Caller
 * passes `key` tied to the target's id so this remounts fresh per open.
 */
export function AccessModal({ open, title, description, initialUserIds, isSaving, onCancel, onSave }: AccessModalProps) {
  const { data: vas } = useListVas()
  const [userIds, setUserIds] = useState<string[]>(initialUserIds)

  if (!open) return null

  const toggle = (id: string) => {
    setUserIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#1A1B1E]">
            <ShieldCheck className="w-4.5 h-4.5 text-[#036638]" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#6B7280]">{description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-[#E5E7EB] divide-y divide-[#F3F4F6] overflow-hidden">
          {(vas ?? []).length === 0 ? (
            <p className="text-xs text-[#9CA3AF] px-3 py-2.5">No VAs to share with yet.</p>
          ) : (
            vas!.map((va) => (
              <label key={va.id} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-[#F9FAFB]">
                <Checkbox checked={userIds.includes(va.id)} onCheckedChange={() => toggle(va.id)} />
                <span className="text-sm text-[#374151]">{va.name}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={isSaving}
            onClick={() => onSave(userIds)}
            className="bg-[#036638] hover:bg-[#025030] text-white"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Access"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
