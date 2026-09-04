"use client"

import { useState } from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useListVas } from "@/hooks/query/usePatients"
import type { PasswordEntry, PasswordGroup } from "@/types"

const NO_GROUP = "none"

export interface EntryFormValues {
  name: string
  username: string
  password: string
  notes: string
  groupId: string
  userIds: string[]
}

interface EntryFormModalProps {
  open: boolean
  mode: "create" | "edit"
  entry: PasswordEntry | null
  groups: PasswordGroup[]
  isSaving: boolean
  onCancel: () => void
  onSave: (values: EntryFormValues) => void
}

function initialValues(entry: PasswordEntry | null): EntryFormValues {
  return {
    name: entry?.name ?? "",
    username: entry?.username ?? "",
    password: "",
    notes: entry?.notes ?? "",
    groupId: entry?.group?.id ?? NO_GROUP,
    userIds: entry?.access?.map((u) => u.id) ?? [],
  }
}

/**
 * Create and edit share the same form — sharing is set inline here (checkbox
 * list of VAs), not a separate step, matching the "select using checkbox at
 * creation time" requirement. In edit mode the password field is optional:
 * left blank, it means "keep the current password" (see UpdateEntrySchema).
 *
 * The caller must pass a `key` that changes with the target (e.g.
 * `key={entry?.id ?? "create"}`) so React remounts this component — and
 * therefore re-seeds its state from a fresh `entry` — instead of syncing
 * state from a prop inside an effect.
 */
export function EntryFormModal({ open, mode, entry, groups, isSaving, onCancel, onSave }: EntryFormModalProps) {
  const { data: vas } = useListVas()
  const [values, setValues] = useState<EntryFormValues>(() => initialValues(entry))
  const [showPassword, setShowPassword] = useState(false)

  if (!open) return null

  const toggleUser = (userId: string) => {
    setValues((prev) => ({
      ...prev,
      userIds: prev.userIds.includes(userId) ? prev.userIds.filter((id) => id !== userId) : [...prev.userIds, userId],
    }))
  }

  const canSave = values.name.trim().length > 0 && (mode === "edit" || values.password.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#1A1B1E]">
            {mode === "create" ? "Add Password" : "Edit Password"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#374151]">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={values.name}
              onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Optimantra Admin Login"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#374151]">Username</label>
            <Input
              value={values.username}
              onChange={(e) => setValues((p) => ({ ...p, username: e.target.value }))}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#374151]">
              Password {mode === "create" && <span className="text-red-500">*</span>}
              {mode === "edit" && <span className="text-[#9CA3AF] font-normal">(leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={values.password}
                onChange={(e) => setValues((p) => ({ ...p, password: e.target.value }))}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#9CA3AF] hover:text-[#374151]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#374151]">Group</label>
            <Select value={values.groupId} onValueChange={(v) => setValues((p) => ({ ...p, groupId: v }))}>
              <SelectTrigger className="w-full h-9 rounded-lg border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] shadow-none focus:ring-2 focus:ring-[#036638]/30 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP}>No group</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#374151]">Notes</label>
            <textarea
              value={values.notes}
              onChange={(e) => setValues((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Optional"
              className="w-full px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#036638]/30 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#374151]">Who can see this password</label>
            <div className="rounded-xl border border-[#E5E7EB] divide-y divide-[#F3F4F6] overflow-hidden">
              {(vas ?? []).length === 0 ? (
                <p className="text-xs text-[#9CA3AF] px-3 py-2.5">No VAs to share with yet.</p>
              ) : (
                vas!.map((va) => (
                  <label key={va.id} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-[#F9FAFB]">
                    <Checkbox checked={values.userIds.includes(va.id)} onCheckedChange={() => toggleUser(va.id)} />
                    <span className="text-sm text-[#374151]">{va.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB] mt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSave || isSaving}
            onClick={() => onSave(values)}
            className="bg-[#036638] hover:bg-[#025030] text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Saving...
              </>
            ) : mode === "create" ? (
              "Add Password"
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
