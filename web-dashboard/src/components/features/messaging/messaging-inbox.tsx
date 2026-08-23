"use client"

import { useState } from "react"
import { ArrowLeft, Loader2, MessageSquare, Search } from "lucide-react"
import { cn, getInitials, timeAgo } from "@/lib/utils"
import { useConversations } from "@/hooks/query/useMessaging"
import { MessageThread } from "./message-thread"
import type { SmsConversation } from "@/types"

/**
 * Central "Messages" inbox — conversation list on one side, thread on the
 * other, per the requirements doc's §2.2 ("structured like a normal
 * messaging app"). Shared between the VA and admin dashboards (mounted from
 * two thin page.tsx wrappers, matching how the rest of this app pairs
 * /dashboard/* and /admin/dashboard/* routes).
 */
export function MessagingInbox() {
  const [search, setSearch] = useState("")
  const [unmatchedOnly, setUnmatchedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading } = useConversations({
    search: search.trim() || undefined,
    unmatchedOnly: unmatchedOnly || undefined,
    limit: 100,
  })
  const conversations = data?.conversations ?? []
  const selected = conversations.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex h-full min-h-0 rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
      {/* Conversation list — full-width on phone until a thread is opened, fixed-width side panel from sm+ */}
      <div
        className={cn(
          "w-full sm:w-[320px] shrink-0 sm:border-r border-gray-100 flex-col min-h-0",
          selectedId ? "hidden sm:flex" : "flex",
        )}
      >
        <div className="p-3 border-b border-gray-100 space-y-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setUnmatchedOnly(false)}
              className={cn(
                "flex-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors",
                !unmatchedOnly ? "bg-[#036638] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              All
            </button>
            <button
              onClick={() => setUnmatchedOnly(true)}
              className={cn(
                "flex-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors",
                unmatchedOnly ? "bg-[#036638] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
              title="Conversations not linked to a known patient"
            >
              Unmatched
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-brand">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-4 h-4 animate-spin text-[#036638]" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 px-4 text-xs text-[#9CA3AF]">
              {unmatchedOnly ? "No unmatched conversations" : "No conversations yet"}
            </div>
          ) : (
            conversations.map((c) => (
              <ConversationRow key={c.id} conversation={c} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className={cn("flex-1 min-h-0 flex-col", selectedId ? "flex" : "hidden sm:flex")}>
        {selected ? (
          <>
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 shrink-0">
              <button
                onClick={() => setSelectedId(null)}
                className="sm:hidden p-1 -ml-1 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-8 h-8 rounded-full bg-[#036638]/10 text-[#036638] flex items-center justify-center text-xs font-bold shrink-0">
                {getInitials(selected.patient?.name || selected.phoneNumber)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#111827] truncate">{selected.patient?.name || "Unmatched number"}</p>
                <p className="text-xs text-[#6B7280] truncate">{selected.phoneNumber}</p>
              </div>
            </div>
            <MessageThread conversation={selected} isActive className="min-h-0" />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[#9CA3AF]">
            <div className="text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-[#D1D5DB]" />
              Select a conversation
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: SmsConversation
  active: boolean
  onClick: () => void
}) {
  const name = conversation.patient?.name || conversation.phoneNumber
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-50 text-left transition-colors",
        active ? "bg-[#EBF7EC]" : "hover:bg-gray-50",
      )}
    >
      <div className="w-9 h-9 rounded-full bg-[#036638]/10 text-[#036638] flex items-center justify-center text-xs font-bold shrink-0">
        {getInitials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className={cn("text-sm truncate", conversation.unreadCount > 0 ? "font-bold text-[#111827]" : "font-medium text-[#374151]")}>
            {name}
          </p>
          {conversation.lastMessageAt && (
            <span className="text-[10px] text-[#9CA3AF] shrink-0">{timeAgo(conversation.lastMessageAt)}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-xs text-[#6B7280] truncate">{conversation.lastMessagePreview || "No messages yet"}</p>
          {conversation.unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#036638] text-white text-[10px] font-bold shrink-0">
              {conversation.unreadCount}
            </span>
          )}
        </div>
        {!conversation.patientId && (
          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold uppercase tracking-wide">
            Unmatched
          </span>
        )}
      </div>
    </button>
  )
}
