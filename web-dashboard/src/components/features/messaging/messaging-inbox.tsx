"use client"

import { useState } from "react"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FolderClosed,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import { toast } from "sonner"
import { cn, formatConversationListTime } from "@/lib/utils"
import { useConversations } from "@/hooks/query/useMessaging"
import { Avatar } from "./avatar"
import { MessageThread } from "./message-thread"
import { ConversationContactPanel } from "./conversation-contact-panel"
import type { SmsConversation } from "@/types"

type InboxTab = "chats" | "calls" | "tasks"

const INBOX_TABS: { key: InboxTab; label: string }[] = [
  { key: "chats", label: "Chats" },
  { key: "calls", label: "Calls" },
  { key: "tasks", label: "Tasks" },
]

/** Header icons that exist to match the reference UI but have no backend yet. */
function DummyIconButton({
  icon: Icon,
  label,
  className,
}: {
  icon: typeof Phone
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      title={`${label} - coming soon`}
      onClick={() => toast.info(`${label} - coming soon`)}
      className={cn(
        "p-1.5 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors",
        className,
      )}
      aria-label={`${label} (coming soon)`}
    >
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
    </button>
  )
}

/**
 * Central "Messages" inbox - three panels (conversation list / active thread
 * / contact panel), matching the reference UI the client supplied. Shared
 * between the VA and admin dashboards via two thin page.tsx wrappers.
 *
 * Panels 2 and 3 are siblings, not nested: MessageThread stays layout-neutral
 * so the patient modal's Messages tab can keep reusing it *without* the
 * contact panel, per the build plan.
 */
export function MessagingInbox() {
  const [tab, setTab] = useState<InboxTab>("chats")
  const [search, setSearch] = useState("")
  const [unmatchedOnly, setUnmatchedOnly] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading } = useConversations({
    search: search.trim() || undefined,
    unmatchedOnly: unmatchedOnly || undefined,
    limit: 100,
  })

  const conversations = data?.conversations ?? []
  // Unread is a pure client-side narrowing of the list we already hold - no
  // backend concept of it, so no extra request.
  const visibleConversations = unreadOnly ? conversations.filter((c) => c.unreadCount > 0) : conversations
  const selected = conversations.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex h-full min-h-0 rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
      {/* ------------------------------------------------------------- */}
      {/* Panel 1 - conversation list                                    */}
      {/* ------------------------------------------------------------- */}
      <div
        className={cn(
          "w-full sm:w-[340px] shrink-0 sm:border-r border-gray-100 flex-col min-h-0",
          selectedId ? "hidden sm:flex" : "flex",
        )}
      >
        {/* Chats | Calls | Tasks */}
        <div className="flex items-center justify-between px-3 pt-2.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-4">
            {INBOX_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "pb-2 text-sm font-semibold border-b-2 transition-colors -mb-px",
                  tab === t.key
                    ? "border-[#036638] text-[#036638]"
                    : "border-transparent text-[#9CA3AF] hover:text-[#6B7280]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 pb-1.5">
            <DummyIconButton icon={Phone} label="New call" />
            <DummyIconButton icon={MessageSquare} label="New message" />
          </div>
        </div>

        {tab !== "chats" ? (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <p className="text-sm font-semibold text-[#6B7280]">
                {tab === "calls" ? "Calls" : "Tasks"} - coming soon
              </p>
              <p className="text-xs text-[#9CA3AF] mt-1">This tab is not wired up yet.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Filter row */}
            <div className="px-3 py-2 space-y-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  title="Status filter - coming soon"
                  onClick={() => toast.info("Status filter - coming soon")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 text-[11px] font-semibold text-[#374151] hover:bg-gray-50 transition-colors"
                >
                  Open <ChevronDown className="w-3 h-3" />
                </button>
                <FilterPill active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
                  Unread
                </FilterPill>
                <FilterPill
                  active={unmatchedOnly}
                  onClick={() => setUnmatchedOnly((v) => !v)}
                  title="Conversations not linked to a known patient"
                >
                  Unmatched
                </FilterPill>
                <button
                  type="button"
                  title="Unresponded filter - coming soon"
                  onClick={() => toast.info("Unresponded filter - coming soon")}
                  className="px-2.5 py-1 rounded-full border border-gray-200 text-[11px] font-semibold text-[#9CA3AF] hover:bg-gray-50 transition-colors"
                >
                  Unresponded
                </button>
                <button
                  type="button"
                  title="Advanced filters - coming soon"
                  onClick={() => toast.info("Advanced filters - coming soon")}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold text-[#9CA3AF] hover:bg-gray-50 transition-colors ml-auto"
                >
                  <SlidersHorizontal className="w-3 h-3" /> Filter
                </button>
              </div>

              {/* Real search - server-side across patient name + phone number. */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or phone..."
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
                <div className="text-center py-10 px-4 text-xs text-[#9CA3AF]">
                  {unreadOnly
                    ? "Nothing unread"
                    : unmatchedOnly
                      ? "No unmatched conversations"
                      : "No conversations yet"}
                </div>
              ) : (
                visibleConversations.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    active={c.id === selectedId}
                    onClick={() => setSelectedId(c.id)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Panel 2 - active thread                                        */}
      {/* ------------------------------------------------------------- */}
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
              <Avatar name={selected.patient?.name || selected.phoneNumber} colorKey={selected.id} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#111827] truncate">
                  {selected.patient?.name || "Unmatched number"}
                </p>
                <p className="text-xs text-[#6B7280] truncate">{selected.phoneNumber}</p>
              </div>
              <div className="ml-auto flex items-center gap-0.5">
                <DummyIconButton icon={Phone} label="Call" />
                <DummyIconButton icon={Check} label="Mark done" className="hidden sm:inline-flex" />
                <DummyIconButton icon={FolderClosed} label="Archive" className="hidden md:inline-flex" />
                <DummyIconButton icon={Search} label="Search in conversation" className="hidden md:inline-flex" />
                <DummyIconButton icon={MoreHorizontal} label="More actions" />
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

      {/* ------------------------------------------------------------- */}
      {/* Panel 3 - contact / notes                                      */}
      {/* ------------------------------------------------------------- */}
      {selected && (
        <div className="hidden xl:flex w-[300px] shrink-0 border-l border-gray-100 flex-col min-h-0">
          <ConversationContactPanel conversation={selected} />
        </div>
      )}
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors",
        active ? "bg-[#036638] border-[#036638] text-white" : "border-gray-200 text-[#374151] hover:bg-gray-50",
      )}
    >
      {children}
    </button>
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
  const unread = conversation.unreadCount > 0
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
        active ? "bg-[#EBF7EC]" : "hover:bg-gray-50",
      )}
    >
      <Avatar name={name} colorKey={conversation.id} />
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
        {!conversation.patientId && (
          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold uppercase tracking-wide">
            Unmatched
          </span>
        )}
      </div>
    </button>
  )
}
