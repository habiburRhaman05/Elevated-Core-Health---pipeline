"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldCheck, Columns3, MessageSquare, FolderOpen } from "lucide-react"
import { useVaPermissions, useUpdateVaPermissions } from "@/hooks/query/usePermissions"
import type { VaPermissionKey, VaPermissionView } from "@/types"
import { cn } from "@/lib/utils"

// Small pill toggle switch — same visual pattern as stage-settings-panel's
// ToggleSwitch, kept local rather than shared since that one isn't exported.
function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0",
        checked ? "bg-[#036638]" : "bg-gray-200",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  )
}

const GROUP_ICON: Record<string, typeof Columns3> = {
  Pipeline: Columns3,
  "Notes & Flags": MessageSquare,
  Documents: FolderOpen,
}

interface PermissionsVaultModalProps {
  userId: string | null
  userName: string
  onClose: () => void
}

export function PermissionsVaultModal({ userId, userName, onClose }: PermissionsVaultModalProps) {
  const { data, isLoading } = useVaPermissions(userId ?? "")
  const updatePermissions = useUpdateVaPermissions()

  // Local optimistic toggle state, seeded from the fetched grants — lets every
  // switch respond instantly without waiting on a round trip per click, while
  // the actual save is an explicit "Save Changes" action (not autosave), so a
  // half-finished set of toggles never partially applies.
  const [pending, setPending] = useState<Record<VaPermissionKey, boolean>>({} as Record<VaPermissionKey, boolean>)

  useEffect(() => {
    if (data?.permissions) {
      const seeded = {} as Record<VaPermissionKey, boolean>
      for (const p of data.permissions) seeded[p.key] = p.granted
      setPending(seeded)
    }
  }, [data])

  if (!userId) return null

  const grouped = (data?.permissions ?? []).reduce<Record<string, VaPermissionView[]>>((acc, p) => {
    acc[p.group] = acc[p.group] ? [...acc[p.group], p] : [p]
    return acc
  }, {})

  const hasChanges = data?.permissions.some((p) => pending[p.key] !== p.granted) ?? false

  const handleSave = async () => {
    if (!userId || !data) return
    const changed = data.permissions.filter((p) => pending[p.key] !== p.granted).map((p) => ({ key: p.key, granted: pending[p.key] }))
    if (changed.length === 0) {
      onClose()
      return
    }
    await updatePermissions.mutateAsync({ userId, grants: changed })
    onClose()
  }

  return (
    <Dialog open={!!userId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-[#1A1B1E]">
            <ShieldCheck className="w-5 h-5 text-[#036638]" />
            Permissions — {userName}
          </DialogTitle>
          <DialogDescription className="text-sm text-[#6B7280]">
            Turn off any action this VA shouldn't be able to take. Everything is granted by default.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-[#036638] animate-spin" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {Object.entries(grouped).map(([group, items]) => {
              const GroupIcon = GROUP_ICON[group] ?? ShieldCheck
              return (
                <div key={group} className="rounded-xl border border-[#E5E7EB] overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F9FAFB] border-b border-[#E5E7EB]">
                    <GroupIcon className="w-4 h-4 text-[#036638]" />
                    <h4 className="text-xs font-bold uppercase tracking-wide text-[#374151]">{group}</h4>
                  </div>
                  <div className="divide-y divide-[#F3F4F6]">
                    {items?.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#1A1B1E]">{item.label}</p>
                          <p className="text-xs text-[#6B7280] mt-0.5">{item.description}</p>
                        </div>
                        <ToggleSwitch
                          checked={pending[item.key] ?? item.granted}
                          onChange={() => setPending((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                          disabled={updatePermissions.isPending}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-[#E5E7EB]">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={updatePermissions.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isLoading || updatePermissions.isPending || !hasChanges}
            className="bg-[#036638] hover:bg-[#025030] text-white"
          >
            {updatePermissions.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
