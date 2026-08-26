"use client"

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { MessagesSquare, UploadCloud } from "lucide-react"
import { cn, formatDateSeparator } from "@/lib/utils"
import { useAuth } from "@/hooks/auth/useAuth"
import {
  useInternalMessages,
  useInternalMessagingStatus,
  useMarkInternalConversationRead,
  useSendInternalMessage,
  useSendTyping,
} from "@/hooks/query/useInternalMessaging"
import { InternalComposer, type InternalComposerHandle } from "./internal-composer"
import { InternalMessageBubble } from "./internal-message-bubble"
import type { InternalMessage, InternalRosterItem, PendingInternalAttachment } from "@/types"

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

/** Three-dot "someone is typing" bubble — same shape language as a real message bubble. */
function TypingBubble({ name }: { name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-2"
    >
      <div className="flex items-center gap-1 bg-[#F3F4F6] rounded-2xl rounded-bl-sm px-3.5 py-2.5" title={`${name} is typing…`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </motion.div>
  )
}

interface InternalThreadProps {
  item: InternalRosterItem | null
  isActive: boolean
  isOtherUserTyping?: boolean
  className?: string
}

export function InternalThread({ item, isActive, isOtherUserTyping, className }: InternalThreadProps) {
  const conversationId = item?.conversation?.id ?? null
  const recipientUserId = item?.user.id ?? null
  const { user } = useAuth()
  const { data: status } = useInternalMessagingStatus()
  const { data: messagesData, isLoading } = useInternalMessages(conversationId, recipientUserId, { enabled: isActive })
  const sendMessage = useSendInternalMessage(user?.id)
  const markRead = useMarkInternalConversationRead()
  const sendTyping = useSendTyping()
  const bottomRef = useRef<HTMLDivElement>(null)
  const markedReadFor = useRef<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<InternalMessage | null>(null)
  const composerRef = useRef<InternalComposerHandle>(null)
  const [dragOver, setDragOver] = useState(false)
  // Counts nested dragenter/dragleave pairs — a plain boolean flickers
  // because the browser fires dragleave every time the cursor crosses a
  // child element's edge, not just when it leaves the whole drop zone.
  const dragDepthRef = useRef(0)

  // Switching who's selected always drops any pending reply — replying
  // across an unrelated thread switch would be surprising, not helpful.
  const prevRecipientRef = useRef(recipientUserId)
  if (prevRecipientRef.current !== recipientUserId) {
    prevRecipientRef.current = recipientUserId
    if (replyingTo !== null) setReplyingTo(null)
  }

  const messages = messagesData?.messages ?? []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  useEffect(() => {
    if (!isActive || !conversationId) return
    if (markedReadFor.current === conversationId) return
    if ((item?.conversation?.unreadCount ?? 0) === 0) return
    markedReadFor.current = conversationId
    markRead.mutate(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, conversationId, item?.conversation?.unreadCount])

  const otherName = item?.user.name ?? "Teammate"

  const handleSend = (body: string | undefined, attachments: PendingInternalAttachment[] | undefined) => {
    if (!recipientUserId) return
    sendMessage.mutate({ conversationId, recipientUserId, body, attachments, replyTo: replyingTo })
  }

  const handleDraftChange = () => {
    if (!recipientUserId) return
    sendTyping(conversationId ? { conversationId } : { recipientUserId })
  }

  const typingLabel = useMemo(() => (isOtherUserTyping ? `${otherName.split(" ")[0]} is typing…` : null), [isOtherUserTyping, otherName])

  const attachmentsEnabled = status?.attachmentsEnabled ?? false

  // Drag-and-drop anywhere in the chat pane (not just the attach popover's
  // own drop zone) — files hand off to the composer's existing upload
  // pipeline via the imperative ref, so there's exactly one upload code path.
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!attachmentsEnabled || !e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    dragDepthRef.current += 1
    setDragOver(true)
  }
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!attachmentsEnabled || !e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
  }
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!attachmentsEnabled) return
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepthRef.current = 0
    setDragOver(false)
    if (!attachmentsEnabled) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) composerRef.current?.addFiles(files)
  }

  if (!item) {
    return (
      <div className={cn("flex-1 flex flex-col items-center justify-center gap-2 text-center px-6", className)}>
        <div className="w-14 h-14 rounded-2xl bg-[#EBF7EC] flex items-center justify-center mb-1">
          <MessagesSquare className="w-6 h-6 text-[#036638]" strokeWidth={1.6} />
        </div>
        <p className="text-sm font-semibold text-[#374151]">Select a teammate</p>
        <p className="text-xs text-[#9CA3AF] max-w-[240px]">Pick anyone from the list to start chatting.</p>
      </div>
    )
  }

  return (
    <div
      className={cn("relative flex-1 flex flex-col min-h-0", className)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-[#036638]/5 backdrop-blur-[1px] border-2 border-dashed border-[#036638] rounded-2xl flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-2 bg-white px-6 py-5 rounded-2xl shadow-xl">
              <UploadCloud className="w-8 h-8 text-[#036638]" strokeWidth={1.5} />
              <p className="text-sm font-bold text-[#036638]">Drop to attach</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-brand space-y-1.5 p-4">
        {isLoading ? (
          <ThreadSkeleton />
        ) : messages.length === 0 && !typingLabel ? (
          <div className="flex items-center justify-center h-full text-center px-6">
            <div>
              <p className="text-sm font-semibold text-[#374151]">No messages yet</p>
              <p className="text-xs text-[#9CA3AF] mt-1">Start a conversation with {otherName.split(" ")[0]}…</p>
            </div>
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
                  <InternalMessageBubble message={message} isOwn={message.senderId === user?.id} onReply={setReplyingTo} />
                </div>
              )
            })}
            {typingLabel && <TypingBubble key="typing" name={otherName} />}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      <InternalComposer
        ref={composerRef}
        attachmentsEnabled={attachmentsEnabled}
        onSend={handleSend}
        onDraftChange={handleDraftChange}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  )
}
