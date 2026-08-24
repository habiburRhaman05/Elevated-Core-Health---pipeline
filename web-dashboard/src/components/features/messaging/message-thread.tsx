"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Loader2, MessageSquareOff, Paperclip, Send } from "lucide-react"
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
import { EmojiPicker } from "./emoji-picker"
import type { SmsConversation } from "@/types"

interface MessageThreadProps {
  conversation: SmsConversation | null | undefined
  /** No usable phone number on file at all (not even a shell conversation). */
  noPhoneNumber?: boolean
  isLoadingConversation?: boolean
  /** Only poll while this thread is actually the one visible on screen. */
  isActive: boolean
  className?: string
  /** Tighter spacing for the patient modal tab vs. the full central inbox. */
  compact?: boolean
}

function isSameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
  )
}

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
  className,
  compact,
}: MessageThreadProps) {
  const conversationId = conversation?.id ?? null
  const { data: status } = useMessagingStatus()
  const { data: messagesData, isLoading: isLoadingMessages } = useConversationMessages(conversationId, {
    enabled: isActive,
  })
  const sendMessage = useSendMessage()
  const markRead = useMarkConversationRead()
  const [draft, setDraft] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const markedReadFor = useRef<string | null>(null)

  const messages = messagesData?.messages ?? []

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
  }, [messages.length])

  const handleSend = () => {
    const content = draft.trim()
    if (!content || !conversationId || sendMessage.isPending) return
    setDraft("")
    sendMessage.mutate({ conversationId, content })
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
  const canSend = !!conversationId && !notConfigured

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
      {notConfigured && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-medium shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          SMS isn&apos;t configured on this server yet - sending is disabled until an admin sets up Quo.
        </div>
      )}

      <div className={cn("flex-1 min-h-0 overflow-y-auto scrollbar-brand space-y-3", compact ? "p-3" : "p-4")}>
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 text-[#036638] animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[#9CA3AF] italic">
            No messages yet - send the first one below.
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOutbound = msg.direction === "outbound"
            const prev = i > 0 ? messages[i - 1] : null
            // A separator whenever the calendar day changes (and always
            // before the very first message).
            const showSeparator = !prev || !isSameCalendarDay(prev.createdAt, msg.createdAt)

            return (
              <div key={msg.id} className="space-y-3">
                {showSeparator && (
                  <div className="flex items-center justify-center pt-1">
                    <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-[#6B7280]">
                      {formatDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}

                <div className={cn("flex flex-col", isOutbound ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                      isOutbound
                        ? msg.status === "failed"
                          ? "bg-[#CC3333]/10 text-[#CC3333] border border-[#CC3333]/30 rounded-br-sm"
                          : "bg-[#036638] text-white rounded-br-sm"
                        : "bg-[#F3F4F6] text-[#1A1B1E] rounded-bl-sm",
                    )}
                  >
                    {msg.body}
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-1.5 mt-1 text-[10px] text-[#9CA3AF]",
                      isOutbound && "flex-row-reverse",
                    )}
                  >
                    {/* Attribution - who sent it, not just "sent" (multiple VAs share this inbox). */}
                    {isOutbound && msg.sentByUser?.name && <span className="font-semibold">{msg.sentByUser.name}</span>}
                    <span>{formatMessageTimestamp(msg.createdAt)}</span>
                    {msg.status === "failed" && (
                      <span className="text-[#CC3333] font-semibold">
                        Failed{msg.errorMessage ? `: ${msg.errorMessage}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className={cn("border-t border-gray-100 shrink-0", compact ? "p-2.5" : "p-3")}>
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={notConfigured ? "SMS isn't configured yet" : "Write a message..."}
            disabled={!canSend}
            rows={1}
            className="min-h-[38px] max-h-24 resize-none text-sm py-2"
          />
          <Button
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
              support, so this is a visible placeholder, never a broken upload. */}
          <button
            type="button"
            title="Attachments - coming soon"
            aria-label="Attach a file (coming soon)"
            onClick={() => toast.info("Attachments coming soon")}
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors"
          >
            <Paperclip className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  )
}
