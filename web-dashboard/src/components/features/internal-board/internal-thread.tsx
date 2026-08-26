"use client"

import { useEffect, useMemo, useRef } from "react"
import { AnimatePresence } from "framer-motion"
import { MessagesSquare } from "lucide-react"
import { cn, formatDateSeparator } from "@/lib/utils"
import { useAuth } from "@/hooks/auth/useAuth"
import {
  useInternalMessages,
  useInternalMessagingStatus,
  useMarkInternalConversationRead,
  useSendInternalMessage,
} from "@/hooks/query/useInternalMessaging"
import { InternalComposer } from "./internal-composer"
import { InternalMessageBubble } from "./internal-message-bubble"
import type { InternalConversation, PendingInternalAttachment } from "@/types"

function isSameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

/** A few pulsing bubble placeholders, alternating sides, while the thread loads. */
function ThreadSkeleton() {
  const widths = ["w-40", "w-56", "w-28", "w-44"]
  return (
    <div className="space-y-4 animate-pulse p-4">
      {widths.map((w, i) => (
        <div key={w} className={cn("flex items-end gap-2", i % 2 === 1 ? "flex-row-reverse" : "flex-row")}>
          <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
          <div className={cn("h-9 rounded-2xl bg-gray-200", w, i % 2 === 1 ? "rounded-br-sm" : "rounded-bl-sm")} />
        </div>
      ))}
    </div>
  )
}

interface InternalThreadProps {
  conversation: InternalConversation | null
  isActive: boolean
  className?: string
}

export function InternalThread({ conversation, isActive, className }: InternalThreadProps) {
  const conversationId = conversation?.id ?? null
  const { user } = useAuth()
  const { data: status } = useInternalMessagingStatus()
  const { data: messagesData, isLoading } = useInternalMessages(conversationId, { enabled: isActive })
  const sendMessage = useSendInternalMessage(user?.id)
  const markRead = useMarkInternalConversationRead()
  const bottomRef = useRef<HTMLDivElement>(null)
  const markedReadFor = useRef<string | null>(null)

  const messages = messagesData?.messages ?? []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  useEffect(() => {
    if (!isActive || !conversationId) return
    if (markedReadFor.current === conversationId) return
    if ((conversation?.unreadCount ?? 0) === 0) return
    markedReadFor.current = conversationId
    markRead.mutate(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, conversationId, conversation?.unreadCount])

  const otherLabel = useMemo(
    () => conversation?.otherParticipants.map((p) => p.name).join(", ") || "Teammate",
    [conversation],
  )

  const handleSend = (body: string | undefined, attachments: PendingInternalAttachment[] | undefined) => {
    if (!conversationId) return
    sendMessage.mutate({ conversationId, body, attachments })
  }

  if (!conversation) {
    return (
      <div className={cn("flex-1 flex flex-col items-center justify-center gap-2 text-center px-6", className)}>
        <div className="w-14 h-14 rounded-2xl bg-[#EBF7EC] flex items-center justify-center mb-1">
          <MessagesSquare className="w-6 h-6 text-[#036638]" strokeWidth={1.6} />
        </div>
        <p className="text-sm font-semibold text-[#374151]">Select a conversation</p>
        <p className="text-xs text-[#9CA3AF] max-w-[240px]">
          Or start a new one from the button above the conversation list.
        </p>
      </div>
    )
  }

  return (
    <div className={cn("flex-1 flex flex-col min-h-0", className)}>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-brand space-y-1.5 p-4">
        {isLoading ? (
          <ThreadSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[#9CA3AF] italic">
            No messages yet — say hello to {otherLabel.split(",")[0]}.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message, i) => {
              const prev = i > 0 ? messages[i - 1] : null
              const showSeparator = !prev || !isSameCalendarDay(prev.createdAt, message.createdAt)
              return (
                <div key={message.id} className="space-y-1.5">
                  {showSeparator && (
                    <div className="flex items-center justify-center pt-1">
                      <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-[#6B7280]">
                        {formatDateSeparator(message.createdAt)}
                      </span>
                    </div>
                  )}
                  <InternalMessageBubble message={message} isOwn={message.senderId === user?.id} />
                </div>
              )
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <InternalComposer
        attachmentsEnabled={status?.attachmentsEnabled ?? false}
        onSend={handleSend}
      />
    </div>
  )
}
