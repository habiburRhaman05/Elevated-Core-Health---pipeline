"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Copy,
  File as FileIcon,
  Loader2,
  MessageSquareOff,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Reply,
  Send,
  Smile,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn, formatDateSeparator, formatMessageTimestamp } from "@/lib/utils"
import {
  useConversationMessages,
  useMarkConversationRead,
  useMessagingStatus,
  useSendMessage,
} from "@/hooks/query/useMessaging"
import { Avatar } from "./avatar"
import { AttachmentPicker } from "./attachment-picker"
import { EmojiPicker } from "./emoji-picker"
import type { SmsCallLog, SmsConversation, SmsMediaItem, SmsMessage } from "@/types"

interface MessageThreadProps {
  conversation: SmsConversation | null | undefined
  /** No usable phone number on file at all (not even a shell conversation). */
  noPhoneNumber?: boolean
  isLoadingConversation?: boolean
  /** Only poll while this thread is actually the one visible on screen. */
  isActive: boolean
  /**
   * Business number to send from when the thread doesn't already belong to
   * one (a brand-new conversation). Ignored by the backend once a thread has
   * its own quoPhoneNumberId — a reply always goes out on the number the
   * patient has been texting, never wherever the toggle happens to be.
   */
  phoneNumberId?: string
  /**
   * Set by the caller when the number this thread would send from (its own
   * owning number, or the toggle's current selection for a brand-new
   * thread) is on the workspace but can't send US SMS (restricted, or no
   * owning Quo user). Disables the composer with this exact reason instead
   * of the generic "not configured" message.
   */
  sendDisabledReason?: string | null
  className?: string
  /** Tighter spacing for the patient modal tab vs. the full central inbox. */
  compact?: boolean
  /**
   * Pins the composer with real `position: fixed` to the phone viewport
   * bottom, below the `sm` breakpoint only — rather than relying on it being
   * the last flex child of a full-height container. Only the central
   * inbox's mobile full-screen thread passes this; the patient modal tab and
   * the desktop panel are unaffected (a truly-fixed composer there would
   * escape their containers and dock to the real page bottom, which is
   * wrong for anything that isn't already a full-viewport overlay).
   */
  fixedComposerOnMobile?: boolean
}

function isSameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

/** Loose union used only to merge+sort messages and calls into one timeline. */
type TimelineItem =
  | { kind: "message"; createdAt: string; data: SmsMessage }
  | { kind: "call"; createdAt: string; data: SmsCallLog }

const REACTION_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

/**
 * Shared thread view (message bubbles + send box) reused by both the central
 * Messages inbox and the patient modal's Messages tab - per the build plan,
 * this is the one place chat UI lives so the two surfaces never drift apart.
 * Deliberately layout-neutral: the /messages page's contact panel is a
 * sibling of this component, never nested inside it.
 */
export function MessageThread({
  conversation,
  noPhoneNumber,
  isLoadingConversation,
  isActive,
  phoneNumberId,
  sendDisabledReason,
  className,
  compact,
  fixedComposerOnMobile,
}: MessageThreadProps) {
  const conversationId = conversation?.id ?? null
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  // Same matchMedia pattern already used in patient-modal.tsx for its own
  // desktop/mobile split - only below `sm` does the composer actually need
  // to be pinned; from `sm` up it's back to a normal flex child.
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640,
  )
  useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia("(max-width: 639.98px)")
    const sync = () => setIsMobileViewport(mql.matches)
    sync()
    mql.addEventListener("change", sync)
    return () => mql.removeEventListener("change", sync)
  }, [])
  const useFixedComposer = Boolean(fixedComposerOnMobile) && isMobileViewport

  // Measures the composer's real height (it grows with the reply-quote
  // banner, multi-line drafts, etc.) so the message list can reserve exactly
  // that much bottom padding - otherwise the fixed composer would cover the
  // last message(s) instead of just sitting below them.
  useEffect(() => {
    if (!useFixedComposer) return
    const el = composerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => setComposerHeight(entries[0].contentRect.height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [useFixedComposer])
  const { data: status } = useMessagingStatus()
  const { data: messagesData, isLoading: isLoadingMessages } = useConversationMessages(conversationId, {
    enabled: isActive,
  })
  const sendMessage = useSendMessage()
  const markRead = useMarkConversationRead()
  const [draft, setDraft] = useState("")
  // Reply is a genuine feature, just not a Quo API one - SMS has no native
  // threading, so "replying" quotes the original text as a prefix in the
  // outgoing body, the same convention most SMS apps use for this.
  const [replyingTo, setReplyingTo] = useState<SmsMessage | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const markedReadFor = useRef<string | null>(null)
  // Clears any pending reply-quote when the open thread changes. React's own
  // documented pattern for "reset state when a prop changes" - compared and
  // applied during render, not as a side effect - rather than a useEffect
  // that calls setState unconditionally on every conversationId change.
  const prevConversationIdRef = useRef(conversationId)
  if (prevConversationIdRef.current !== conversationId) {
    prevConversationIdRef.current = conversationId
    if (replyingTo !== null) setReplyingTo(null)
  }

  const messages = messagesData?.messages
  const calls = messagesData?.calls

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...(messages ?? []).map((m): TimelineItem => ({ kind: "message", createdAt: m.createdAt, data: m })),
      ...(calls ?? []).map((c): TimelineItem => ({ kind: "call", createdAt: c.createdAt, data: c })),
    ]
    items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return items
  }, [messages, calls])

  // Mark read once per conversation open (not on every poll tick).
  useEffect(() => {
    if (!isActive || !conversationId) return
    if (markedReadFor.current === conversationId) return
    if ((conversation?.unreadCount ?? 0) === 0) return
    markedReadFor.current = conversationId
    markRead.mutate(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, conversationId, conversation?.unreadCount])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [timeline.length])

  const handleSend = () => {
    const content = draft.trim()
    if (!content || !conversationId || sendMessage.isPending) return
    const body = replyingTo ? `> ${quoteSnippet(replyingTo.body)}\n${content}` : content
    setDraft("")
    setReplyingTo(null)
    sendMessage.mutate({ conversationId, content: body, phoneNumberId })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /** Inserts at the caret rather than appending, so an emoji can go mid-sentence. */
  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current
    if (!el) {
      setDraft((d) => d + emoji)
      return
    }
    const start = el.selectionStart ?? draft.length
    const end = el.selectionEnd ?? draft.length
    const next = draft.slice(0, start) + emoji + draft.slice(end)
    setDraft(next)
    // Restore the caret after React re-renders with the new value.
    requestAnimationFrame(() => {
      el.focus()
      const caret = start + emoji.length
      el.setSelectionRange(caret, caret)
    })
  }

  const notConfigured = status?.configured === false
  const canSend = !!conversationId && !notConfigured && !sendDisabledReason
  const patientLabel = conversation?.patient?.name || conversation?.phoneNumber || "Patient"

  if (isLoadingConversation) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        <Loader2 className="w-5 h-5 text-[#036638] animate-spin" />
      </div>
    )
  }

  if (noPhoneNumber || (!conversationId && !isLoadingConversation)) {
    return (
      <div className={cn("flex-1 flex flex-col items-center justify-center gap-2 text-center px-6", className)}>
        <MessageSquareOff className="w-8 h-8 text-[#D1D5DB]" />
        <p className="text-sm font-semibold text-[#6B7280]">No phone number on file</p>
        <p className="text-xs text-[#9CA3AF] max-w-[260px]">
          Add a phone number in Contact &amp; Payment to enable SMS for this patient.
        </p>
      </div>
    )
  }

  return (
    <div className={cn("flex-1 flex flex-col min-h-0", className)}>
      {notConfigured ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          SMS isn&apos;t configured on this server yet - sending is disabled until an admin sets up Quo.
        </div>
      ) : (
        sendDisabledReason && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {sendDisabledReason}
          </div>
        )
      )}

      <div
        className={cn("flex-1 min-h-0 overflow-y-auto scrollbar-brand space-y-3", compact ? "p-3" : "p-4")}
        style={useFixedComposer ? { paddingBottom: composerHeight } : undefined}
      >
        {isLoadingMessages ? (
          <MessageSkeleton />
        ) : timeline.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[#9CA3AF] italic">
            No messages yet - send the first one below.
          </div>
        ) : (
          timeline.map((item, i) => {
            const prev = i > 0 ? timeline[i - 1] : null
            // A separator whenever the calendar day changes (and always
            // before the very first item).
            const showSeparator = !prev || !isSameCalendarDay(prev.createdAt, item.createdAt)

            return (
              <div key={`${item.kind}-${item.data.id}`} className="space-y-3">
                {showSeparator && (
                  <div className="flex items-center justify-center pt-1">
                    <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-[#6B7280]">
                      {formatDateSeparator(item.createdAt)}
                    </span>
                  </div>
                )}

                {item.kind === "call" ? (
                  <CallLogEntry call={item.data} patientLabel={patientLabel} />
                ) : (
                  <MessageBubble
                    message={item.data}
                    patientLabel={patientLabel}
                    onReply={() => setReplyingTo(item.data)}
                  />
                )}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div
        ref={composerRef}
        className={cn(
          "border-t border-gray-100 shrink-0 bg-white",
          compact ? "p-2.5" : "p-3",
          // `position: fixed` resolves to the true viewport regardless of
          // the thread panel's own bounded box, so this needs the SAME
          // bottom-24 offset the panel uses to clear the floating bottom
          // nav - otherwise the composer slides underneath it again. No
          // extra safe-area padding needed here (unlike a true edge-to-edge
          // fixed bar) since the nav bar itself already owns that space.
          useFixedComposer && "fixed inset-x-0 bottom-24 z-10",
        )}
      >
        {replyingTo && (
          <div className="flex items-start gap-2 mb-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
            <Reply className="w-3.5 h-3.5 text-[#6B7280] shrink-0 mt-0.5" />
            <p className="flex-1 min-w-0 text-xs text-[#6B7280] truncate">
              Replying to: <span className="text-[#374151]">{quoteSnippet(replyingTo.body)}</span>
            </p>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
              className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              notConfigured
                ? "SMS isn't configured yet"
                : sendDisabledReason
                  ? "Sending disabled on this number"
                  : "Write a message..."
            }
            disabled={!canSend}
            rows={1}
            className="min-h-[38px] max-h-24 resize-none text-sm py-2"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={!canSend || !draft.trim() || sendMessage.isPending}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shrink-0 h-[38px] w-[38px] p-0"
            title="Send"
          >
            {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        <div className="flex items-center gap-0.5 mt-1">
          <EmojiPicker onSelect={insertEmoji} disabled={!canSend} />
          {/* Attachments are explicitly out of scope - Quo's API has no MMS
              support - so this opens an explained, visually-disabled popup
              instead of a real file picker. Not gated on canSend: it's
              informational and safe to open even when sending is disabled. */}
          <AttachmentPicker />
        </div>
      </div>
    </div>
  )
}

/** First line, trimmed short - just enough to identify which message is quoted. */
function quoteSnippet(body: string): string {
  const firstLine = body.split("\n")[0]
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine
}

function MessageBubble({
  message,
  patientLabel,
  onReply,
}: {
  message: SmsMessage
  patientLabel: string
  onReply: () => void
}) {
  const isOutbound = message.direction === "outbound"
  const avatarName = isOutbound ? message.sentByUser?.name || "You" : patientLabel
  const media = message.media ?? []
  const hasBody = message.body.trim().length > 0

  return (
    <div className={cn("group flex items-end gap-2", isOutbound ? "flex-row-reverse" : "flex-row")}>
      <Avatar name={avatarName} colorKey={isOutbound ? (message.sentById ?? "you") : patientLabel} size="sm" />

      <div className={cn("flex flex-col max-w-[75%]", isOutbound ? "items-end" : "items-start")}>
        <div className={cn("flex items-end gap-1", isOutbound ? "flex-row-reverse" : "flex-row")}>
          <div className={cn("flex flex-col gap-1.5", isOutbound ? "items-end" : "items-start")}>
            {media.length > 0 && <MessageMedia items={media} />}
            {hasBody && (
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                  isOutbound
                    ? message.status === "failed"
                      ? "bg-[#CC3333]/10 text-[#CC3333] border border-[#CC3333]/30 rounded-br-sm"
                      : "bg-[#036638] text-white rounded-br-sm"
                    : "bg-[#F3F4F6] text-[#1A1B1E] rounded-bl-sm",
                )}
              >
                {message.body}
              </div>
            )}
          </div>

          {/* Hover action toolbar - Reply is real (quotes into the composer,
              a text-prefix convention since SMS has no native threading).
              Reaction/Copy are here too but reactions can't reach Quo - no
              public API endpoint for it, only inside Quo's own app. */}
          <MessageHoverActions message={message} onReply={onReply} />
        </div>

        <div
          className={cn(
            "flex items-center gap-1.5 mt-1 text-[10px] text-[#9CA3AF]",
            isOutbound && "flex-row-reverse",
          )}
        >
          {/* Attribution - who sent it, not just "sent" (multiple VAs share this inbox). */}
          {isOutbound && message.sentByUser?.name && <span className="font-semibold">{message.sentByUser.name}</span>}
          <span>{formatMessageTimestamp(message.createdAt)}</span>
          {message.status === "failed" && (
            <span className="text-[#CC3333] font-semibold">
              Failed{message.errorMessage ? `: ${message.errorMessage}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** Filename guess from the URL's path - Quo doesn't give us one directly. */
function guessFilename(url: string): string {
  try {
    const path = new URL(url).pathname
    const last = path.split("/").filter(Boolean).pop()
    return last || "attachment"
  } catch {
    return "attachment"
  }
}

function MessageMediaItem({ item }: { item: SmsMediaItem }) {
  const [imageFailed, setImageFailed] = useState(false)
  const isImage = (item.type ?? "").startsWith("image/")

  if (isImage && !imageFailed) {
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className="block max-w-[220px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- external, per-message Quo media host, not worth configuring next/image for */}
        <img
          src={item.url}
          alt="Attachment"
          onError={() => setImageFailed(true)}
          className="rounded-xl max-w-full max-h-[240px] object-cover border border-gray-100"
        />
      </a>
    )
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors max-w-[220px]"
    >
      <FileIcon className="w-4 h-4 text-[#6B7280] shrink-0" />
      <span className="text-xs text-[#374151] truncate">{guessFilename(item.url)}</span>
    </a>
  )
}

function MessageMedia({ items }: { items: SmsMediaItem[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: media items have no stable id from Quo
        <MessageMediaItem key={`${item.url}-${i}`} item={item} />
      ))}
    </div>
  )
}

function MessageHoverActions({ message, onReply }: { message: SmsMessage; onReply: () => void }) {
  const [reactOpen, setReactOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!reactOpen) return
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setReactOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [reactOpen])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.body)
      toast.success("Copied")
    } catch {
      toast.error("Couldn't copy - your browser blocked clipboard access")
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
        reactOpen && "opacity-100",
      )}
    >
      <button
        type="button"
        title="Reply"
        aria-label="Reply to this message"
        onClick={onReply}
        className="p-1 rounded-md text-[#9CA3AF] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors"
      >
        <Reply className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="React"
        aria-label="React to this message"
        onClick={() => setReactOpen((v) => !v)}
        className="p-1 rounded-md text-[#9CA3AF] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors"
      >
        <Smile className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="Copy text"
        aria-label="Copy message text"
        onClick={handleCopy}
        className="p-1 rounded-md text-[#9CA3AF] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>

      {reactOpen && (
        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-white border border-gray-200 rounded-full shadow-lg px-1.5 py-1 z-50 whitespace-nowrap">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setReactOpen(false)
                // Quo's public API has no endpoint to attach a reaction to a
                // message - reactions only exist inside Quo's own app. Never
                // fake persisting one here.
                toast.info("Reactions aren't available through Quo's API yet")
              }}
              className="w-7 h-7 flex items-center justify-center text-base rounded-full hover:bg-gray-100 transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Loosely maps Quo's raw call `status` values into a simple 3-way read. */
function describeCall(call: SmsCallLog): { label: string; tone: "missed" | "completed" | "neutral" } {
  const missedStatuses = new Set(["missed", "no-answer", "busy", "abandoned", "canceled", "failed"])
  const completedStatuses = new Set(["completed", "answered", "forwarded"])

  if (missedStatuses.has(call.status)) {
    return { label: "Missed call", tone: "missed" }
  }
  if (completedStatuses.has(call.status)) {
    return {
      label: call.direction === "outgoing" ? "Outgoing call" : "Incoming call",
      tone: "completed",
    }
  }
  return { label: call.direction === "outgoing" ? "Calling…" : "Incoming call", tone: "neutral" }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function CallLogEntry({ call, patientLabel }: { call: SmsCallLog; patientLabel: string }) {
  const { label, tone } = describeCall(call)
  const Icon = tone === "missed" ? PhoneMissed : call.direction === "outgoing" ? PhoneOutgoing : PhoneIncoming

  return (
    <div className="flex items-center gap-2">
      <Avatar name={patientLabel} colorKey={patientLabel} size="sm" />
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-2xl rounded-bl-sm border text-sm",
          tone === "missed" ? "bg-[#CC3333]/5 border-[#CC3333]/20" : "bg-gray-50 border-gray-100",
        )}
      >
        <span
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
            tone === "missed" ? "bg-[#CC3333]/15 text-[#CC3333]" : "bg-[#036638]/10 text-[#036638]",
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0">
          <p className={cn("font-semibold", tone === "missed" ? "text-[#CC3333]" : "text-[#1A1B1E]")}>{label}</p>
          <p className="text-[11px] text-[#9CA3AF]">
            {formatMessageTimestamp(call.createdAt)}
            {tone === "completed" && call.durationSeconds != null && ` · ${formatDuration(call.durationSeconds)}`}
          </p>
        </div>
      </div>
    </div>
  )
}

/** A few pulsing bubble placeholders, alternating sides, while the thread loads. */
function MessageSkeleton() {
  const widths = ["w-40", "w-56", "w-28", "w-44"]
  return (
    <div className="space-y-4 animate-pulse">
      {widths.map((w, i) => (
        <div key={w} className={cn("flex items-end gap-2", i % 2 === 1 ? "flex-row-reverse" : "flex-row")}>
          <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
          <div className={cn("h-9 rounded-2xl bg-gray-200", w, i % 2 === 1 ? "rounded-br-sm" : "rounded-bl-sm")} />
        </div>
      ))}
    </div>
  )
}
