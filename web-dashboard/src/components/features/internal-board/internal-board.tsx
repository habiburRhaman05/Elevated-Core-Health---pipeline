"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Link2, Loader2, Search } from "lucide-react"
import { cn, formatConversationListTime } from "@/lib/utils"
import { useInternalRoster, useRealtimeInternalBoard } from "@/hooks/query/useInternalMessaging"
import { InternalAvatar } from "./internal-avatar"
import { InternalThread } from "./internal-thread"
import type { InternalRosterItem } from "@/types"

function ConversationRow({
  item,
  active,
  online,
  onClick,
}: {
  item: InternalRosterItem
  active: boolean
  online: boolean
  onClick: () => void
}) {
  const name = item.user.name
  const unread = (item.conversation?.unreadCount ?? 0) > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
        active ? "bg-[#EBF7EC]" : "hover:bg-gray-50",
      )}
    >
      <InternalAvatar name={name} colorKey={item.user.id} avatarUrl={item.user.avatar} online={online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className={cn("text-sm truncate", unread ? "font-bold text-[#111827]" : "font-semibold text-[#374151]")}>
            {name}
          </p>
          {item.conversation?.lastMessageAt && (
            <span className="text-[10px] text-[#9CA3AF] shrink-0">
              {formatConversationListTime(item.conversation.lastMessageAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className={cn("text-xs truncate", unread ? "text-[#374151] font-medium" : "text-[#6B7280]")}>
            {item.conversation?.lastMessagePreview || "No messages yet"}
          </p>
          {unread && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#036638] text-white text-[10px] font-bold shrink-0">
              {item.conversation?.unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-[#6B7280] text-[9px] font-semibold capitalize">
            {item.user.role.replace("_", " ")}
          </span>
        </div>
      </div>
    </button>
  )
}

/**
 * Link Internal Board — real-time staff (VA/Admin) chat. Phase 2: the
 * sidebar is auto-synced to every teammate (see useInternalRoster), so it
 * doubles as the "start a new chat" picker — no separate dialog, no
 * conversation created until the first message is actually sent.
 */
export function InternalBoard() {
  const [search, setSearch] = useState("")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const { data, isLoading } = useInternalRoster()
  const items = data?.items ?? []
  const selectedItem = items.find((i) => i.user.id === selectedUserId) ?? null
  const selectedConversationId = selectedItem?.conversation?.id ?? null

  const {
    status: realtimeStatus,
    typingFromUserId,
    onlineUserIds,
  } = useRealtimeInternalBoard(selectedConversationId)

  // Plain per-render filter, not memoized — the roster is staff-sized (a
  // handful of VAs/Admins), so this is cheap enough that memoizing it would
  // just add bookkeeping without a measurable win.
  const q = search.trim().toLowerCase()
  const visibleItems = q ? items.filter((i) => i.user.name.toLowerCase().includes(q)) : items

  return (
    <div className="flex h-full min-h-0 rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
      {/* ------------------------------------------------------------- */}
      {/* Panel 1 — auto-synced teammate list                             */}
      {/* ------------------------------------------------------------- */}
      <div
        className={cn(
          "w-full sm:w-[320px] shrink-0 sm:border-r border-gray-100 flex-col min-h-0",
          selectedUserId ? "hidden sm:flex" : "flex",
        )}
      >
        <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5 border-b border-gray-100 shrink-0">
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
          ) : visibleItems.length === 0 ? (
            <div className="text-center py-10 px-5">
              <p className="text-xs text-[#9CA3AF]">
                {search ? "No teammates match that search" : "No other teammates yet"}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {visibleItems.map((item) => (
                <motion.div key={item.user.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ConversationRow
                    item={item}
                    active={item.user.id === selectedUserId}
                    online={onlineUserIds.has(item.user.id)}
                    onClick={() => setSelectedUserId(item.user.id)}
                  />
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
          // Full-viewport overlay on mobile — deliberately bottom-0, not
          // offset for the floating bottom nav: an open thread should own
          // the whole screen (nav sits behind it, z-60 > the nav's z-50),
          // same as any chat app's full-screen conversation view.
          selectedUserId
            ? "fixed inset-x-0 top-14 bottom-0 z-60 bg-white flex sm:static sm:inset-auto sm:z-auto sm:flex-1"
            : "hidden sm:flex sm:flex-1",
        )}
      >
        {selectedItem && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedUserId(null)}
              className="sm:hidden p-1 -ml-1 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Back to teammates"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <InternalAvatar
              name={selectedItem.user.name}
              colorKey={selectedItem.user.id}
              avatarUrl={selectedItem.user.avatar}
              online={onlineUserIds.has(selectedItem.user.id)}
              size="sm"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#111827] truncate">{selectedItem.user.name}</p>
              <p className="text-xs text-[#6B7280] truncate">
                {typingFromUserId === selectedItem.user.id ? (
                  <span className="text-[#036638] font-semibold">typing…</span>
                ) : onlineUserIds.has(selectedItem.user.id) ? (
                  "Online"
                ) : (
                  <span className="capitalize">{selectedItem.user.role.replace("_", " ")}</span>
                )}
              </p>
            </div>
          </div>
        )}

        <InternalThread
          item={selectedItem}
          isActive={!!selectedUserId}
          isOtherUserTyping={!!selectedItem && typingFromUserId === selectedItem.user.id}
          className="min-h-0"
        />
      </div>
    </div>
  )
}
