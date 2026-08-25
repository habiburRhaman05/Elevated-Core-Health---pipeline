"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  FolderClosed,
  Inbox,
  List,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { avatarColor, cn, formatConversationListTime } from "@/lib/utils"
import { useConversations, useMessagingNumbers, useRealtimeMessaging } from "@/hooks/query/useMessaging"
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

/** Explicit "All Inboxes" is written as this sentinel rather than just
 *  removing the `number` param, so it's distinguishable from "the user
 *  hasn't chosen anything yet" (a totally absent param) - see the
 *  first-visit default below. */
const ALL_NUMBERS_PARAM = "all"

/**
 * Keeps the selected business number in the `?number=` query param instead
 * of only component state, so a refresh or a shared link lands on the same
 * number - same idea as the board's `?claim=` param.
 *
 * `null` means "All numbers". On a first-ever visit (no `number` param at
 * all) this defaults to the Secondary (restricted) number if one exists,
 * rather than "All" - an explicit "All Inboxes" click writes the
 * ALL_NUMBERS_PARAM sentinel, so that choice sticks across refreshes
 * instead of being re-defaulted away.
 */
function useSelectedNumberParam(
  numbers: { phoneNumberId: string; messagingCapable: boolean }[],
): [string | null, (id: string | null) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rawUrlValue = searchParams.get("number")
  const urlValue = rawUrlValue === ALL_NUMBERS_PARAM ? null : rawUrlValue

  const setSelected = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("number", id ?? ALL_NUMBERS_PARAM)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  // Drop a stale/unrecognized id (e.g. a number that's since been removed
  // from the workspace) once the real list is known - falls back to "All".
  useEffect(() => {
    if (!urlValue || numbers.length === 0) return
    if (!numbers.some((n) => n.phoneNumberId === urlValue)) setSelected(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numbers, urlValue])

  // First-ever visit only (param truly absent, not even the "all" sentinel):
  // default to the Primary (capable) number so new threads can send. Falls
  // back to the Secondary if no capable number exists. Runs at most once per
  // URL - as soon as any selection (including explicit "All") is made,
  // rawUrlValue is never null again, so this never fires again for that URL.
  useEffect(() => {
    if (rawUrlValue !== null || numbers.length === 0) return
    const primary = numbers.find((n) => n.messagingCapable)
    if (primary) setSelected(primary.phoneNumberId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numbers, rawUrlValue])

  const valid = urlValue && numbers.some((n) => n.phoneNumberId === urlValue)
  return [valid ? urlValue : null, setSelected]
}

/**
 * "Inbox" dropdown/select - a single collapsed control showing the current
 * selection, opening a menu of every number on click (not a static list).
 * Hidden entirely with 0-1 numbers (requirement #4 - nothing to
 * disambiguate). "All Inboxes" is an addition beyond the reference
 * screenshot: it's the only way pre-multi-number conversations
 * (quoPhoneNumberId: null) stay reachable.
 */
function NumberToggle({
  numbers,
  selected,
  onSelect,
  unreadByNumber,
  totalUnread,
}: {
  numbers: { phoneNumberId: string; formattedNumber: string; messagingCapable: boolean }[]
  selected: string | null
  onSelect: (id: string | null) => void
  unreadByNumber: Record<string, number>
  totalUnread: number
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Same open/close pattern as EmojiPicker/AttachmentPicker - outside click
  // or Escape closes it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  if (numbers.length < 2) return null

  const current = numbers.find((n) => n.phoneNumberId === selected)
  const currentLabel = current ? (current.messagingCapable ? "Primary" : "Secondary") : "All Inboxes"
  const currentSublabel = current ? current.formattedNumber : `${numbers.length} numbers`
  const currentUnread = current ? (unreadByNumber[current.phoneNumberId] ?? 0) : totalUnread
  const currentIconClassName = current ? avatarColor(current.phoneNumberId).bg : "bg-[#374151]"

  return (
    <div className="relative px-3 pt-2.5 pb-1" ref={containerRef}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] px-1 mb-1.5">Inbox</p>

      {/* Collapsed trigger - shows the current selection, click to open the dropdown */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white transition-colors text-left"
      >
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0",
            currentIconClassName,
          )}
        >
          {current ? <Phone className="w-4 h-4" /> : <Inbox className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold text-[#111827] truncate">{currentLabel}</p>
            {current && !current.messagingCapable && (
              <span className="shrink-0 px-1 py-[1px] rounded bg-gray-100 text-[8px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                No SMS
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#6B7280] truncate">{currentSublabel}</p>
        </div>
        {currentUnread > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#CC3333] text-white text-[10px] font-bold shrink-0">
            {currentUnread}
          </span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 text-[#9CA3AF] shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-1 space-y-0.5">
          <InboxRow
            icon={<Inbox className="w-4 h-4" />}
            iconClassName="bg-[#374151]"
            label="All Inboxes"
            sublabel={`${numbers.length} numbers`}
            active={selected === null}
            unread={totalUnread}
            onClick={() => {
              onSelect(null)
              setOpen(false)
            }}
          />
          {numbers.map((n) => (
            <InboxRow
              key={n.phoneNumberId}
              icon={<Phone className="w-4 h-4" />}
              iconClassName={avatarColor(n.phoneNumberId).bg}
              // Both are literally named "Primary" in Quo itself, so relabel
              // for our own UI: the one that can actually send is "Primary",
              // any other (e.g. restricted) is "Secondary".
              label={n.messagingCapable ? "Primary" : "Secondary"}
              sublabel={n.formattedNumber}
              active={selected === n.phoneNumberId}
              unread={unreadByNumber[n.phoneNumberId] ?? 0}
              // Still selectable - viewing a restricted inbox's history is
              // fine, same as Quo's own dashboard. Only sending is blocked
              // (server-side, and reflected in the composer once selected).
              messagingCapable={n.messagingCapable}
              onClick={() => {
                onSelect(n.phoneNumberId)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InboxRow({
  icon,
  iconClassName,
  label,
  sublabel,
  active,
  unread,
  messagingCapable,
  onClick,
}: {
  icon: React.ReactNode
  iconClassName: string
  label: string
  sublabel: string
  active: boolean
  unread: number
  /** Undefined for "All Inboxes", which is never restricted. */
  messagingCapable?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={messagingCapable === false ? `${sublabel} can't send SMS (restricted)` : undefined}
      className={cn(
        "w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg transition-colors text-left",
        active ? "bg-[#EBF7EC]" : "hover:bg-gray-50",
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0",
          iconClassName,
          messagingCapable === false && "opacity-50",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p
            className={cn(
              "text-xs truncate",
              active ? "font-bold text-[#036638]" : "font-semibold text-[#111827]",
              messagingCapable === false && "text-[#9CA3AF]",
            )}
          >
            {label}
          </p>
          {messagingCapable === false && (
            <span className="shrink-0 px-1 py-[1px] rounded bg-gray-100 text-[8px] font-bold uppercase tracking-wide text-[#9CA3AF]">
              No SMS
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#6B7280] truncate">{sublabel}</p>
      </div>
      {unread > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#CC3333] text-white text-[10px] font-bold shrink-0">
          {unread}
        </span>
      )}
    </button>
  )
}


export function MessagingInbox() {
  const [tab, setTab] = useState<InboxTab>("chats")
  const [search, setSearch] = useState("")
  const [unmatchedOnly, setUnmatchedOnly] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [showListDrawer, setShowListDrawer] = useState(false)

  // WhatsApp-style in-thread search - open state + query live here (the
  // header row that hosts the input is here too), match COUNT comes back
  // from MessageThread since it's the one holding the actual messages.
  const [threadSearchOpen, setThreadSearchOpen] = useState(false)
  const [threadSearchQuery, setThreadSearchQuery] = useState("")
  const [threadMatchCount, setThreadMatchCount] = useState(0)
  const [threadActiveMatchIndex, setThreadActiveMatchIndex] = useState(0)

  const closeThreadSearch = useCallback(() => {
    setThreadSearchOpen(false)
    setThreadSearchQuery("")
    setThreadMatchCount(0)
    setThreadActiveMatchIndex(0)
  }, [])

  // Leaving a thread (or switching to another) always closes search rather
  // than carrying a query into an unrelated conversation.
  useEffect(() => {
    closeThreadSearch()
  }, [selectedId, closeThreadSearch])

  const handleThreadSearchMatchesChange = useCallback((count: number) => {
    setThreadMatchCount(count)
    // Jump to the most recent match whenever the result set actually
    // changes (new query, or the message list itself changed) - a stale
    // index would otherwise point at a match from the previous query.
    setThreadActiveMatchIndex(count > 0 ? count - 1 : 0)
  }, [])

  const goToPrevMatch = useCallback(() => {
    setThreadActiveMatchIndex((i) => (threadMatchCount === 0 ? 0 : (i - 1 + threadMatchCount) % threadMatchCount))
  }, [threadMatchCount])

  const goToNextMatch = useCallback(() => {
    setThreadActiveMatchIndex((i) => (threadMatchCount === 0 ? 0 : (i + 1) % threadMatchCount))
  }, [threadMatchCount])

  const { data: numbersData } = useMessagingNumbers()
  // Real-time push via Pusher — invalidates queries on new messages.
  // Falls back to polling-only (no-op) when Pusher env vars are missing.
  const { status: realtimeStatus } = useRealtimeMessaging(selectedId)
  const numbers = useMemo(() => numbersData?.numbers ?? [], [numbersData])
  const [selectedNumberId, setSelectedNumberId] = useSelectedNumberParam(numbers)

  const { data, isLoading } = useConversations({
    search: search.trim() || undefined,
    unmatchedOnly: unmatchedOnly || undefined,
    phoneNumberId: selectedNumberId ?? undefined,
    limit: 100,
  })

  // Unfiltered - same query key the sidebar badge already uses, so this adds
  // no extra request beyond what's already polling. Needed for the Inboxes
  // list's per-number unread badges, which must total across ALL numbers
  // regardless of which one is currently selected.
  const { data: allData } = useConversations({ limit: 100 })
  const unreadByNumber = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of allData?.conversations ?? []) {
      if (!c.quoPhoneNumberId || c.unreadCount === 0) continue
      map[c.quoPhoneNumberId] = (map[c.quoPhoneNumberId] ?? 0) + c.unreadCount
    }
    return map
  }, [allData])
  const totalUnread = useMemo(
    () => (allData?.conversations ?? []).reduce((sum, c) => sum + c.unreadCount, 0),
    [allData],
  )
  const numberLabelById = useMemo(
    () => Object.fromEntries(numbers.map((n) => [n.phoneNumberId, n.formattedNumber])),
    [numbers],
  )

  const conversations = data?.conversations ?? []
  // Unread is a pure client-side narrowing of the list we already hold - no
  // backend concept of it, so no extra request.
  const visibleConversations = unreadOnly ? conversations.filter((c) => c.unreadCount > 0) : conversations
  const selected = conversations.find((c) => c.id === selectedId) ?? null

  // Which number would this thread actually send from? A reply always goes
  // out on the thread's own number; a brand-new thread uses whatever the
  // toggle is set to. Mirrors the same resolution order sendMessage() uses
  // server-side, so this local check never disagrees with the real gate.
  //
  // Defensive backstop for threads with null quoPhoneNumberId: when the
  // conversation has no owning number AND there's exactly one capable
  // number on the workspace, default to that one automatically — don't
  // fall back to the toggle selection (which might be the restricted
  // number). Only fall back to the toggle when there's genuine ambiguity
  // (2+ capable numbers AND no number on the conversation).
  const capableNumbers = numbers.filter((n) => n.messagingCapable)
  const effectiveNumberId = selected?.quoPhoneNumberId
    ?? (selected && !selected.quoPhoneNumberId && capableNumbers.length === 1
      ? capableNumbers[0].phoneNumberId
      : selectedNumberId)
  const effectiveNumber = effectiveNumberId ? numbers.find((n) => n.phoneNumberId === effectiveNumberId) : undefined
  const sendDisabledReason =
    effectiveNumber && !effectiveNumber.messagingCapable
      ? `${effectiveNumber.formattedNumber} can't send SMS - its US messaging is restricted on the Quo workspace.`
      : null

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
        <NumberToggle
          numbers={numbers}
          selected={selectedNumberId}
          onSelect={setSelectedNumberId}
          unreadByNumber={unreadByNumber}
          totalUnread={totalUnread}
        />

        {/* Chats | Calls | Tasks */}
        <div className="flex items-center justify-between px-3 pt-2.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-4">
            {INBOX_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "pb-2 text-sm font-semibold border-b-2 transition-colors -mb-px",
                  tab === t.key
                    ? "border-[#036638] text-[#036638]"
                    : "border-transparent text-[#9CA3AF] hover:text-[#6B7280]",
                )}
              >
                {t.label}
                {/* Real-time connection status dot — only on Chats tab */}
                {t.key === "chats" && (
                  <span
                    title={
                      realtimeStatus === "live"
                        ? "Live — messages update in real-time"
                        : realtimeStatus === "reconnecting"
                          ? "Reconnecting — messages may be delayed"
                          : "Polling only — real-time not configured"
                    }
                    className={cn(
                      "inline-block w-1.5 h-1.5 rounded-full ml-1.5 -mb-px",
                      realtimeStatus === "live"
                        ? "bg-emerald-400"
                        : realtimeStatus === "reconnecting"
                          ? "bg-amber-400 animate-pulse"
                          : "bg-gray-300",
                    )}
                  />
                )}
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
                    numberLabel={c.quoPhoneNumberId ? numberLabelById[c.quoPhoneNumberId] : undefined}
                    showNumberBadge={numbers.length >= 2 && selectedNumberId === null}
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
      {/* On phone (< sm), an open thread becomes a full-screen fixed overlay
          - the standard WhatsApp/iMessage pattern - rather than a panel
          squeezed inside the page's normal padded/scrolling layout. From
          sm+ it's back to being a regular flex-1 panel in the 3-panel row. */}
      <div
        className={cn(
          "min-h-0 flex-col",
          selectedId
            ? "fixed inset-x-0 top-14 bottom-24 z-60 bg-white flex sm:static sm:inset-auto sm:z-auto sm:flex-1"
            : "hidden sm:flex sm:flex-1",
        )}
      >
        {selected ? (
          <>
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null)
                  setShowListDrawer(false)
                }}
                className="sm:hidden p-1 -ml-1 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              {/* Quick peek at the full conversation list without leaving this
                  thread - sm+ already shows the list panel alongside, so this
                  is phone-only. */}
              <button
                type="button"
                onClick={() => setShowListDrawer(true)}
                className="sm:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Show all conversations"
                title="All conversations"
              >
                <List className="w-4 h-4" />
              </button>
              {threadSearchOpen ? (
                <>
                  {/* WhatsApp-style swap: the name/avatar block is replaced by
                      a search input while searching, rather than opening a
                      separate bar - same header row, same height. */}
                  <Search className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                  <input
                    autoFocus
                    value={threadSearchQuery}
                    onChange={(e) => setThreadSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        if (e.shiftKey) goToPrevMatch()
                        else goToNextMatch()
                      } else if (e.key === "Escape") {
                        closeThreadSearch()
                      }
                    }}
                    placeholder="Search in conversation..."
                    className="flex-1 min-w-0 text-sm text-[#111827] outline-none bg-transparent placeholder:text-[#9CA3AF]"
                  />
                  <div className="flex items-center gap-0.5 shrink-0">
                    {threadSearchQuery.trim() && (
                      <span className="text-[11px] text-[#9CA3AF] tabular-nums px-1 select-none">
                        {threadMatchCount > 0 ? `${threadActiveMatchIndex + 1}/${threadMatchCount}` : "0/0"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={goToPrevMatch}
                      disabled={threadMatchCount === 0}
                      aria-label="Previous match"
                      title="Previous match"
                      className="p-1 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goToNextMatch}
                      disabled={threadMatchCount === 0}
                      aria-label="Next match"
                      title="Next match"
                      className="p-1 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={closeThreadSearch}
                      aria-label="Close search"
                      title="Close search"
                      className="p-1 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Avatar name={selected.patient?.name || selected.quoContactName || selected.phoneNumber} colorKey={selected.id} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#111827] truncate">
                      {selected.patient?.name || selected.quoContactName || "Unmatched number"}
                    </p>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-xs text-[#6B7280] truncate">{selected.phoneNumber}</p>
                      {numbers.length >= 2 && selected.quoPhoneNumberId && numberLabelById[selected.quoPhoneNumberId] && (
                        <span
                          title={`On our ${numberLabelById[selected.quoPhoneNumberId]} business line`}
                          className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded bg-gray-100 text-[9px] font-semibold text-[#6B7280] shrink-0"
                        >
                          <span
                            className={cn("w-1.5 h-1.5 rounded-full", avatarColor(selected.quoPhoneNumberId).bg)}
                          />
                          {numberLabelById[selected.quoPhoneNumberId]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-0.5">
                    <DummyIconButton icon={Phone} label="Call" />
                    <DummyIconButton icon={Check} label="Mark done" className="hidden sm:inline-flex" />
                    <DummyIconButton icon={FolderClosed} label="Archive" className="hidden md:inline-flex" />
                    <button
                      type="button"
                      onClick={() => setThreadSearchOpen(true)}
                      title="Search in conversation"
                      aria-label="Search in conversation"
                      className="hidden md:inline-flex p-1.5 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors"
                    >
                      <Search className="w-[18px] h-[18px]" strokeWidth={1.8} />
                    </button>
                    <DummyIconButton icon={MoreHorizontal} label="More actions" />
                  </div>
                </>
              )}
            </div>
            <MessageThread
              conversation={selected}
              isActive
              phoneNumberId={selectedNumberId ?? undefined}
              sendDisabledReason={sendDisabledReason}
              fixedComposerOnMobile
              className="min-h-0"
              searchQuery={threadSearchOpen ? threadSearchQuery : ""}
              activeMatchIndex={threadActiveMatchIndex}
              onSearchMatchesChange={handleThreadSearchMatchesChange}
            />
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

      {/* ------------------------------------------------------------- */}
      {/* Quick-access conversation list drawer (phone only) - lets you    */}
      {/* jump to another conversation from inside an open thread without  */}
      {/* leaving it. Above the thread's own z-60 overlay.                 */}
      {/* ------------------------------------------------------------- */}
      {showListDrawer && selectedId && (
        <div className="sm:hidden fixed inset-x-0 top-14 bottom-24 z-100 flex">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowListDrawer(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative w-[85%] max-w-[340px] h-full bg-white flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 shrink-0">
              <p className="text-sm font-bold text-[#111827]">Conversations</p>
              <button
                type="button"
                onClick={() => setShowListDrawer(false)}
                aria-label="Close"
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3 py-2 border-b border-gray-100 shrink-0">
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
                <div className="text-center py-10 px-4 text-xs text-[#9CA3AF]">No conversations yet</div>
              ) : (
                visibleConversations.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    active={c.id === selectedId}
                    onClick={() => {
                      setSelectedId(c.id)
                      setShowListDrawer(false)
                    }}
                    numberLabel={c.quoPhoneNumberId ? numberLabelById[c.quoPhoneNumberId] : undefined}
                    showNumberBadge={numbers.length >= 2 && selectedNumberId === null}
                  />
                ))
              )}
            </div>
          </div>
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
  numberLabel,
  showNumberBadge,
}: {
  conversation: SmsConversation
  active: boolean
  onClick: () => void
  /** This thread's owning business number, formatted for display. */
  numberLabel?: string
  /** Only shown in "All Inboxes" view with 2+ numbers - redundant once
   *  already filtered down to a single number. */
  showNumberBadge?: boolean
}) {
  // Display priority: patient name > Quo contact name > raw phone number
  const name = conversation.patient?.name || conversation.quoContactName || conversation.phoneNumber
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
        <div className="flex items-center gap-1.5 mt-1">
          {!conversation.patientId && (
            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold uppercase tracking-wide">
              Unmatched
            </span>
          )}
          {showNumberBadge && numberLabel && (
            <span
              title={`Number: ${numberLabel}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-[#6B7280] text-[9px] font-semibold"
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", avatarColor(conversation.quoPhoneNumberId as string).bg)} />
              {numberLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
