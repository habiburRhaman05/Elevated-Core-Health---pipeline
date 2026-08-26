"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Link2, Loader2, Search, SquarePen } from "lucide-react"
import { cn, formatConversationListTime } from "@/lib/utils"
import {
  useInternalConversations,
  useRealtimeInternalBoard,
  useStartInternalConversation,
} from "@/hooks/query/useInternalMessaging"
import { InternalAvatar } from "./internal-avatar"
import { InternalThread } from "./internal-thread"
import { NewConversationDialog } from "./new-conversation-dialog"
import type { InternalConversation } from "@/types"

function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: InternalConversation
  active: boolean
  onClick: () => void
}) {
  const other = conversation.otherParticipants[0]
  const name = other?.name ?? "Teammate"
  const unread = conversation.unreadCount > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
        active ? "bg-[#EBF7EC]" : "hover:bg-gray-50",
      )}
    >
      <InternalAvatar name={name} colorKey={other?.id ?? conversation.id} avatarUrl={other?.avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className={cn("text-sm truncate", unread ? "font-bold text-[#111827]" : "font-semibold text-[#374151]")}>
            {name}
          </p>
          {conversation.lastMessageAt && (
            <span className="text-[10px] text-[#9CA3AF] shrink-0">
              {formatConversationListTime(conversation.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className={cn("text-xs truncate", unread ? "text-[#374151] font-medium" : "text-[#6B7280]")}>
            {conversation.lastMessagePreview || "No messages yet"}
          </p>
          {unread && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#036638] text-white text-[10px] font-bold shrink-0">
              {conversation.unreadCount}
            </span>
          )}
        </div>
        {other?.role && (
          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-gray-100 text-[#6B7280] text-[9px] font-semibold capitalize">
            {other.role.replace("_", " ")}
          </span>
        )}
      </div>
    </button>
  )
}

/**
 * Link Internal Board — real-time staff (VA/Admin) chat. Fully self-contained:
 * its own conversation list, thread, composer, and realtime subscription,
 * nothing shared with the SMS messaging inbox beyond generic UI primitives.
 */
export function InternalBoard() {
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data, isLoading } = useInternalConversations()
  const { status: realtimeStatus } = useRealtimeInternalBoard(selectedId)
  const startConversation = useStartInternalConversation()

  const conversations = data?.conversations ?? []
  const visibleConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => c.otherParticipants.some((p) => p.name.toLowerCase().includes(q)))
  }, [conversations, search])

  const selected = conversations.find((c) => c.id === selectedId) ?? null
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  const handlePickTeammate = (userId: string) => {
    startConversation.mutate(userId, {
      onSuccess: (result) => {
        setSelectedId(result.conversation.id)
        setPickerOpen(false)
      },
    })
  }

  return (
    <div className="flex h-full min-h-0 rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
      {/* ------------------------------------------------------------- */}
      {/* Panel 1 — conversation list                                     */}
      {/* ------------------------------------------------------------- */}
      <div
        className={cn(
          "w-full sm:w-[320px] shrink-0 sm:border-r border-gray-100 flex-col min-h-0",
          selectedId ? "hidden sm:flex" : "flex",
        )}
      >
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#65BD6C] to-[#036638] flex items-center justify-center shrink-0">
              <Link2 className="w-3.5 h-3.5 text-white" strokeWidth={2.3} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#111827] leading-tight truncate">Link Internal Board</p>
              <span
                title={
                  realtimeStatus === "live"
                    ? "Live — messages update in real-time"
                    : realtimeStatus === "reconnecting"
                      ? "Reconnecting — messages may be delayed"
                      : "Polling only — real-time not configured"
                }
                className="flex items-center gap-1 text-[10px] text-[#9CA3AF] leading-tight"
              >
                <span
                  className={cn(
                    "inline-block w-1.5 h-1.5 rounded-full",
                    realtimeStatus === "live"
                      ? "bg-emerald-400"
                      : realtimeStatus === "reconnecting"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-gray-300",
                  )}
                />
                {realtimeStatus === "live" ? "Live" : realtimeStatus === "reconnecting" ? "Connecting…" : "Offline"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            title="New message"
            aria-label="New message"
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors shrink-0"
          >
            <SquarePen className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teammates..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-brand">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-4 h-4 animate-spin text-[#036638]" />
            </div>
          ) : visibleConversations.length === 0 ? (
            <div className="text-center py-10 px-5">
              <p className="text-xs text-[#9CA3AF] mb-3">
                {search ? "No conversations match that search" : "No conversations yet"}
              </p>
              {!search && (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#036638] text-white text-xs font-semibold hover:bg-[#025030] transition-colors"
                >
                  <SquarePen className="w-3.5 h-3.5" />
                  Start a conversation
                </button>
              )}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {visibleConversations.map((c) => (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <ConversationRow conversation={c} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Panel 2 — active thread                                         */}
      {/* ------------------------------------------------------------- */}
      <div
        className={cn(
          "min-h-0 flex-col",
          selectedId
            ? "fixed inset-x-0 top-14 bottom-24 z-60 bg-white flex sm:static sm:inset-auto sm:z-auto sm:flex-1"
            : "hidden sm:flex sm:flex-1",
        )}
      >
        {selected && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="sm:hidden p-1 -ml-1 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <InternalAvatar
              name={selected.otherParticipants[0]?.name ?? "Teammate"}
              colorKey={selected.otherParticipants[0]?.id ?? selected.id}
              avatarUrl={selected.otherParticipants[0]?.avatar}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#111827] truncate">
                {selected.otherParticipants.map((p) => p.name).join(", ") || "Teammate"}
              </p>
              <p className="text-xs text-[#6B7280] capitalize truncate">
                {selected.otherParticipants[0]?.role.replace("_", " ") ?? ""}
              </p>
            </div>
          </div>
        )}

        <InternalThread conversation={selected} isActive={!!selectedId} className="min-h-0" />
      </div>

      <NewConversationDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePickTeammate}
        isStarting={startConversation.isPending}
      />
    </div>
  )
}
