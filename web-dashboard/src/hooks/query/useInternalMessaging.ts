"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { QUERY_KEYS } from "@/constants"
import { useAuth } from "@/hooks/auth/useAuth"
import { buildInternalBoardSocketUrl, getInternalBoardAuthToken } from "@/lib/internal-board-socket-client"
import { InternalMessagingService } from "@/services/internal-messaging.service"
import type {
  InternalMessage,
  InternalMessagesResponse,
  InternalMessageTarget,
  InternalRosterItem,
  InternalRosterResponse,
  PendingInternalAttachment,
} from "@/types"

/** Best-effort message out of an axios-shaped error without resorting to `any`. */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const response = (err as { response?: { data?: { message?: unknown } } }).response
    if (typeof response?.data?.message === "string") return response.data.message
    const message = (err as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return fallback
}

/** Lets the composer/attachment button show "not configured yet" instead of
 *  failing silently. Rarely changes — an admin sets env vars and redeploys. */
export function useInternalMessagingStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.INTERNAL_MESSAGING.STATUS,
    queryFn: () => InternalMessagingService.getStatus(),
    staleTime: 60_000,
    retry: false,
  })
}

/**
 * Phase 2 — the auto-synced sidebar. Every teammate, whether or not a
 * conversation exists yet. Polls as a fallback behind the realtime patches
 * in useRealtimeInternalBoard below; a missed push just means up to 20s
 * staleness, never a wrong state.
 */
export function useInternalRoster() {
  return useQuery({
    queryKey: QUERY_KEYS.INTERNAL_MESSAGING.ROSTER,
    queryFn: () => InternalMessagingService.getRoster(),
    refetchInterval: 20_000,
  })
}

/** The message-list query key slot for a given selection: a real
 *  conversation id once one exists, or a stable per-recipient placeholder
 *  before the first message is sent. Same slot either way, so the lazy-send
 *  flow can seed/migrate it without the thread ever flashing empty. */
function messagesKeyId(conversationId: string | null | undefined, recipientUserId: string | null | undefined): string {
  if (conversationId) return conversationId
  if (recipientUserId) return `pending:${recipientUserId}`
  return ""
}

/** Thread fetch — `enabled` so only the currently-open thread polls. Only
 *  actually hits the network once a real conversationId exists; before that
 *  it just reads whatever the lazy-send mutation has seeded into this slot. */
export function useInternalMessages(
  conversationId: string | null | undefined,
  recipientUserId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const keyId = messagesKeyId(conversationId, recipientUserId)
  return useQuery({
    queryKey: QUERY_KEYS.INTERNAL_MESSAGING.MESSAGES(keyId),
    queryFn: () => InternalMessagingService.getMessages(conversationId as string),
    enabled: !!conversationId && !!keyId && options?.enabled !== false,
    refetchInterval: !!conversationId && options?.enabled !== false ? 8_000 : false,
  })
}

/** Best-effort snippet for the optimistic bubble/roster row — mirrors the
 *  backend's own preview truncation closely enough for the instant it takes
 *  the real response to land. */
function draftPreview(body: string | undefined, attachments: PendingInternalAttachment[] | undefined): string {
  const trimmed = body?.trim()
  if (trimmed) return trimmed.slice(0, 140)
  if (attachments?.length) return `📎 ${attachments.length > 1 ? `${attachments.length} attachments` : attachments[0].fileName}`
  return ""
}

/** Surgically bumps one roster item to the top with fresh preview/unread —
 *  never a refetch. Shared by the send-mutation's own optimistic patch and
 *  the realtime push handler below, so "my own send" and "their message
 *  arrived" behave identically. */
function patchRoster(
  qc: QueryClient,
  otherUserId: string,
  patch: { conversationId: string; lastMessageAt: string; lastMessagePreview: string; unreadDelta: number },
) {
  qc.setQueryData<InternalRosterResponse>(QUERY_KEYS.INTERNAL_MESSAGING.ROSTER, (old) => {
    if (!old) return old
    const items = old.items.map((item): InternalRosterItem => {
      if (item.user.id !== otherUserId) return item
      const prevUnread = item.conversation?.unreadCount ?? 0
      return {
        ...item,
        conversation: {
          id: patch.conversationId,
          lastMessageAt: patch.lastMessageAt,
          lastMessagePreview: patch.lastMessagePreview,
          unreadCount: Math.max(0, prevUnread + patch.unreadDelta),
        },
      }
    })
    items.sort((a, b) => {
      const at = a.conversation?.lastMessageAt ? new Date(a.conversation.lastMessageAt).getTime() : 0
      const bt = b.conversation?.lastMessageAt ? new Date(b.conversation.lastMessageAt).getTime() : 0
      if (at !== bt) return bt - at
      return a.user.name.localeCompare(b.user.name)
    })
    return { items }
  })
}

interface SendVars {
  /** null until the first message resolves it — see messagesKeyId(). */
  conversationId: string | null
  /** The other participant — always known (the roster row being messaged),
   *  even before a conversation exists. */
  recipientUserId: string
  body?: string
  attachments?: PendingInternalAttachment[]
  /** The full message being replied to (not just its id) — needed so the
   *  OPTIMISTIC bubble can render the quote immediately, on the sender's own
   *  screen, instead of only appearing once the server round-trip lands. */
  replyTo?: InternalMessage | null
}

/**
 * Optimistic send — the bubble (with its already-uploaded attachments)
 * appears instantly, faded, with a spinner; replaced in place on success,
 * marked "failed" (not removed) on error. Also handles the lazy-conversation
 * migration: when `conversationId` was null, the resolved real id's cache
 * slot is seeded from the pending one so the thread never re-fetches empty,
 * and the roster is patched so the teammate's row now shows the new DM.
 */
export function useSendInternalMessage(currentUserId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, recipientUserId, body, attachments, replyTo }: SendVars) =>
      InternalMessagingService.sendMessage(conversationId ? { conversationId } : { recipientUserId }, {
        body,
        attachments,
        replyToId: replyTo?.id,
      }),
    onMutate: async (vars) => {
      const keyId = messagesKeyId(vars.conversationId, vars.recipientUserId)
      const key = QUERY_KEYS.INTERNAL_MESSAGING.MESSAGES(keyId)
      await qc.cancelQueries({ queryKey: key })
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const optimistic: InternalMessage = {
        id: tempId,
        conversationId: vars.conversationId ?? "",
        senderId: currentUserId ?? "me",
        sender: { id: currentUserId ?? "me", name: "You", role: "va", avatar: null },
        body: vars.body || null,
        attachments: (vars.attachments ?? []).map((a, i) => ({ id: `${tempId}-att-${i}`, ...a })),
        // Built straight from the original message the composer already had
        // in memory — same quote a fresh server fetch would return, just
        // available instantly instead of waiting on the round-trip.
        replyTo: vars.replyTo
          ? {
              id: vars.replyTo.id,
              body: vars.replyTo.body,
              senderId: vars.replyTo.senderId,
              senderName: vars.replyTo.sender.name,
              attachmentPreview: vars.replyTo.attachments[0] ?? null,
              deleted: false,
            }
          : null,
        editedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        status: "sending",
      }
      qc.setQueryData<InternalMessagesResponse>(key, (old) =>
        old
          ? { ...old, messages: [...old.messages, optimistic], total: old.total + 1 }
          : { messages: [optimistic], total: 1, page: 1, limit: 50 },
      )
      patchRoster(qc, vars.recipientUserId, {
        conversationId: vars.conversationId ?? keyId,
        lastMessageAt: optimistic.createdAt,
        lastMessagePreview: draftPreview(vars.body, vars.attachments),
        unreadDelta: 0,
      })
      return { keyId, tempId }
    },
    onSuccess: (data, vars, context) => {
      if (!context) return
      const realId = data.conversation.id
      const realKey = QUERY_KEYS.INTERNAL_MESSAGING.MESSAGES(realId)
      const pendingKey = QUERY_KEYS.INTERNAL_MESSAGING.MESSAGES(context.keyId)

      const replaceTemp = (old: InternalMessagesResponse | undefined): InternalMessagesResponse | undefined =>
        old ? { ...old, messages: old.messages.map((m) => (m.id === context.tempId ? data.message : m)) } : old

      if (realId !== context.keyId) {
        // Lazy path resolved — migrate the pending cache entry to the real
        // conversation id and drop the placeholder so nothing re-fetches it.
        const pending = qc.getQueryData<InternalMessagesResponse>(pendingKey)
        qc.setQueryData<InternalMessagesResponse>(realKey, replaceTemp(pending))
        qc.removeQueries({ queryKey: pendingKey })
      } else {
        qc.setQueryData<InternalMessagesResponse>(realKey, replaceTemp)
      }

      // Belt-and-suspenders: the in-place swap above is enough on its own,
      // but a background refetch right after guarantees the sender's own
      // bubble ends up with the exact server-side shape (reply quote,
      // attachment metadata, ...) even if some future edit to the swap
      // logic gets a compound field like replyTo subtly wrong. Cheap — the
      // cache is already correct-ish, so this never shows a loading flicker.
      qc.invalidateQueries({ queryKey: realKey })

      patchRoster(qc, vars.recipientUserId, {
        conversationId: realId,
        lastMessageAt: data.message.createdAt,
        lastMessagePreview: draftPreview(vars.body, vars.attachments),
        unreadDelta: 0,
      })
    },
    onError: (err: unknown, _vars, context) => {
      if (context) {
        const key = QUERY_KEYS.INTERNAL_MESSAGING.MESSAGES(context.keyId)
        qc.setQueryData<InternalMessagesResponse>(key, (old) =>
          old
            ? { ...old, messages: old.messages.map((m) => (m.id === context.tempId ? { ...m, status: "failed" as const } : m)) }
            : old,
        )
      }
      toast.error(extractErrorMessage(err, "Message failed to send"))
    },
  })
}

export function useMarkInternalConversationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => InternalMessagingService.markRead(conversationId),
    onMutate: async (conversationId) => {
      // Surgical, optimistic — zero out just this row's badge immediately
      // rather than waiting on the round-trip (or a poll) to do it.
      qc.setQueryData<InternalRosterResponse>(QUERY_KEYS.INTERNAL_MESSAGING.ROSTER, (old) =>
        old
          ? {
              items: old.items.map((item) =>
                item.conversation?.id === conversationId
                  ? { ...item, conversation: { ...item.conversation, unreadCount: 0 } }
                  : item,
              ),
            }
          : old,
      )
    },
    // Silent on error — background nicety, not worth interrupting the user.
    // The next roster poll/push will correct an unlikely optimistic miss.
  })
}

/** Throttled typing ping — safe to call on every keystroke; only actually
 *  hits the network at most once per ~2.5s per target. */
export function useSendTyping() {
  const lastSentAtRef = useRef(0)
  return (target: InternalMessageTarget) => {
    const now = Date.now()
    if (now - lastSentAtRef.current < 2_500) return
    lastSentAtRef.current = now
    InternalMessagingService.sendTyping(target).catch(() => {})
  }
}

interface TypingState {
  fromUserId: string
  fromName: string
}

/** Shape of every event the backend's WebSocket can push for Link Internal
 *  Board — mirrors InternalRealtimeEvent in backend/src/lib/realtime.ts. The
 *  SMS module pushes other `type`s over this same socket too; those just
 *  fall through the switch below's `default` untouched. */
type InternalSocketEvent =
  | { type: "internal.new-message"; conversationId: string; messageId: string; senderId: string; preview: string; createdAt: string }
  | { type: "internal.conversation-updated"; conversationId: string }
  | { type: "internal.typing"; fromUserId: string; fromName: string }
  | { type: "internal.presence"; onlineUserIds: string[] }

const RECONNECT_DELAY_MS = 2_000

/**
 * Real-time push over a plain WebSocket to the backend's attachRealtime()
 * server — see internal-board-socket-client.ts. One connection covers
 * everything Link Internal Board needs (roster patches, typing, presence);
 * unlike the old Pusher setup there's no separate per-thread channel to
 * (re)subscribe to, since a "new-message" push for any conversation the
 * caller belongs to already arrives on this same socket.
 *
 * Degrades to the polling intervals in useInternalRoster/useInternalMessages
 * if the socket can't connect (network blip, server restart) — it retries
 * on a fixed delay and the UI's `status` reflects the gap honestly rather
 * than silently going stale.
 */
export function useRealtimeInternalBoard(conversationId?: string | null) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [status, setStatus] = useState<"live" | "reconnecting" | "unavailable">("reconnecting")
  const [typing, setTyping] = useState<TypingState | null>(null)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read inside the socket's onmessage closure without needing to tear down
  // and reconnect the whole socket every time the open thread changes.
  const conversationIdRef = useRef(conversationId)
  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  useEffect(() => {
    if (!user?.id) {
      queueMicrotask(() => setStatus("unavailable"))
      return
    }
    const token = getInternalBoardAuthToken()
    if (!token) {
      queueMicrotask(() => setStatus("unavailable"))
      return
    }

    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const connect = () => {
      socket = new WebSocket(buildInternalBoardSocketUrl(token))

      socket.onopen = () => setStatus("live")

      socket.onclose = () => {
        if (stopped) return
        setStatus("reconnecting")
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
      }

      socket.onerror = () => {
        socket?.close()
      }

      socket.onmessage = (evt) => {
        let event: InternalSocketEvent
        try {
          event = JSON.parse(evt.data)
        } catch {
          return
        }

        switch (event.type) {
          case "internal.new-message": {
            // My own send already patched the roster synchronously in
            // useSendInternalMessage's onSuccess.
            if (event.senderId === user.id) return
            const isOpen = conversationIdRef.current === event.conversationId
            patchRoster(qc, event.senderId, {
              conversationId: event.conversationId,
              lastMessageAt: event.createdAt,
              lastMessagePreview: event.preview,
              unreadDelta: isOpen ? 0 : 1,
            })
            if (isOpen) {
              qc.invalidateQueries({ queryKey: QUERY_KEYS.INTERNAL_MESSAGING.MESSAGES(event.conversationId) })
            }
            break
          }
          case "internal.typing": {
            if (event.fromUserId === user.id) return
            setTyping({ fromUserId: event.fromUserId, fromName: event.fromName })
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = setTimeout(() => setTyping(null), 3_000)
            break
          }
          case "internal.presence": {
            setOnlineUserIds(new Set(event.onlineUserIds))
            break
          }
          default:
            break
        }
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [qc, user?.id])

  return {
    status,
    typingFromUserId: typing?.fromUserId ?? null,
    onlineUserIds,
  }
}
