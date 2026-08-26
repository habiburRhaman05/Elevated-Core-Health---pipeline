"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { QUERY_KEYS } from "@/constants"
import { useAuth } from "@/hooks/auth/useAuth"
import { getInternalBoardPusherClient, isInternalBoardPusherConfigured } from "@/lib/internal-board-pusher-client"
import { InternalMessagingService } from "@/services/internal-messaging.service"
import type { InternalMessage, InternalMessagesResponse, PendingInternalAttachment } from "@/types"

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

/** Conversation list — polls as a fallback behind Pusher real-time push,
 *  same "instant when live, never more than a few seconds stale when not"
 *  contract as the SMS inbox. */
export function useInternalConversations() {
  return useQuery({
    queryKey: QUERY_KEYS.INTERNAL_MESSAGING.CONVERSATIONS,
    queryFn: () => InternalMessagingService.listConversations(),
    refetchInterval: 20_000,
  })
}

/** Thread fetch — `enabled` so only the currently-open thread polls. */
export function useInternalMessages(conversationId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.INTERNAL_MESSAGING.MESSAGES(conversationId ?? ""),
    queryFn: () => InternalMessagingService.getMessages(conversationId as string),
    enabled: !!conversationId && options?.enabled !== false,
    refetchInterval: 8_000,
  })
}

/** Idempotent find-or-create DM, used by the "New message" teammate picker. */
export function useStartInternalConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => InternalMessagingService.startConversation(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.INTERNAL_MESSAGING.ALL })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || "Couldn't start that conversation")
    },
  })
}

interface SendVars {
  conversationId: string
  body?: string
  attachments?: PendingInternalAttachment[]
}

/**
 * Optimistic send — the bubble (with its already-uploaded attachments)
 * appears instantly, faded, with a spinner; replaced in place on success,
 * marked "failed" (not removed) on error so a VA can retry/see what didn't
 * go through rather than losing the draft silently.
 */
export function useSendInternalMessage(currentUserId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, body, attachments }: SendVars) =>
      InternalMessagingService.sendMessage(conversationId, body, attachments),
    onMutate: async (vars) => {
      const key = QUERY_KEYS.INTERNAL_MESSAGING.MESSAGES(vars.conversationId)
      await qc.cancelQueries({ queryKey: key })
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const optimistic: InternalMessage = {
        id: tempId,
        conversationId: vars.conversationId,
        senderId: currentUserId ?? "me",
        sender: { id: currentUserId ?? "me", name: "You", role: "va", avatar: null },
        body: vars.body || null,
        attachments: (vars.attachments ?? []).map((a, i) => ({ id: `${tempId}-att-${i}`, ...a })),
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
      return { key, tempId }
    },
    onSuccess: (data, vars, context) => {
      if (context) {
        qc.setQueryData<InternalMessagesResponse>(context.key, (old) =>
          old
            ? { ...old, messages: old.messages.map((m) => (m.id === context.tempId ? data.message : m)) }
            : old,
        )
      }
      qc.invalidateQueries({ queryKey: QUERY_KEYS.INTERNAL_MESSAGING.CONVERSATIONS })
    },
    onError: (err: any, _vars, context) => {
      if (context) {
        qc.setQueryData<InternalMessagesResponse>(context.key, (old) =>
          old
            ? { ...old, messages: old.messages.map((m) => (m.id === context.tempId ? { ...m, status: "failed" as const } : m)) }
            : old,
        )
      }
      toast.error(err?.response?.data?.message || err?.message || "Message failed to send")
    },
  })
}

export function useMarkInternalConversationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => InternalMessagingService.markRead(conversationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.INTERNAL_MESSAGING.CONVERSATIONS })
    },
    // Silent on error — background nicety, not worth interrupting the user.
  })
}

/**
 * Real-time push via the internal board's own Pusher client (see
 * internal-board-pusher-client.ts for why it isn't the shared SMS one).
 * Subscribes to the caller's personal inbox channel (list-level updates) and
 * optionally a per-thread channel. Degrades to the polling intervals above
 * when Pusher isn't configured.
 */
export function useRealtimeInternalBoard(conversationId?: string | null) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [status, setStatus] = useState<"live" | "reconnecting" | "unavailable">(
    isInternalBoardPusherConfigured ? "reconnecting" : "unavailable",
  )

  useEffect(() => {
    if (!isInternalBoardPusherConfigured || !user?.id) return
    const pusher = getInternalBoardPusherClient()
    if (!pusher) return

    const onConnected = () => setStatus("live")
    const onDisconnected = () => setStatus("reconnecting")
    pusher.connection.bind("connected", onConnected)
    pusher.connection.bind("disconnected", onDisconnected)
    pusher.connection.bind("reconnecting", onDisconnected)
    if (pusher.connection.state === "connected") setStatus("live")

    const channelName = `private-internal-board-${user.id}`
    const channel = pusher.subscribe(channelName)
    const onListUpdate = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.INTERNAL_MESSAGING.CONVERSATIONS })
    channel.bind("new-message", onListUpdate)
    channel.bind("conversation-updated", onListUpdate)

    return () => {
      pusher.connection.unbind("connected", onConnected)
      pusher.connection.unbind("disconnected", onDisconnected)
      pusher.connection.unbind("reconnecting", onDisconnected)
      channel.unbind("new-message", onListUpdate)
      channel.unbind("conversation-updated", onListUpdate)
      pusher.unsubscribe(channelName)
    }
  }, [qc, user?.id])

  useEffect(() => {
    if (!isInternalBoardPusherConfigured || !conversationId) return
    const pusher = getInternalBoardPusherClient()
    if (!pusher) return

    const channelName = `private-internal-conversation-${conversationId}`
    const channel = pusher.subscribe(channelName)
    const onNewMessage = () => qc.invalidateQueries({ queryKey: QUERY_KEYS.INTERNAL_MESSAGING.MESSAGES(conversationId) })
    channel.bind("new-message", onNewMessage)

    return () => {
      channel.unbind("new-message", onNewMessage)
      pusher.unsubscribe(channelName)
    }
  }, [qc, conversationId])

  return { status }
}
