"use client"

import { useMemo, useState } from "react"
import { Loader2, MessageCirclePlus, Search } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAllUsers } from "@/hooks/query/useUsers"
import { useAuth } from "@/hooks/auth/useAuth"
import { cn } from "@/lib/utils"
import { InternalAvatar } from "./internal-avatar"

interface NewConversationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (userId: string) => void
  /** True while startConversation's mutation is in flight, to disable rows and show a spinner. */
  isStarting?: boolean
}

/**
 * Teammate picker for "New message" — lists every other staff account
 * (admin + VA, reusing the generic GET /users directory, not anything
 * messaging-specific) so any VA/Admin can start a DM with any other.
 */
export function NewConversationDialog({ open, onOpenChange, onPick, isStarting }: NewConversationDialogProps) {
  const { user: me } = useAuth()
  const { data: users, isLoading } = useAllUsers()
  const [search, setSearch] = useState("")

  const teammates = useMemo(() => {
    const list = (users ?? []).filter((u) => u.id !== me?.id)
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((u) => u.name.toLowerCase().includes(q))
  }, [users, me?.id, search])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSearch("")
      }}
    >
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCirclePlus className="w-4 h-4 text-[#036638]" />
            New message
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teammates..."
              className="w-full pl-8 pr-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto scrollbar-brand border-t border-gray-100">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-4 h-4 animate-spin text-[#036638]" />
            </div>
          ) : teammates.length === 0 ? (
            <p className="text-center py-10 text-xs text-[#9CA3AF]">
              {search ? "No teammates match that search" : "No other teammates yet"}
            </p>
          ) : (
            teammates.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={isStarting}
                onClick={() => onPick(u.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors disabled:opacity-50",
                  "hover:bg-[#EBF7EC]",
                )}
              >
                <InternalAvatar name={u.name} colorKey={u.id} avatarUrl={u.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#111827] truncate">{u.name}</p>
                  <p className="text-[11px] text-[#9CA3AF] capitalize">{u.role.replace("_", " ")}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
