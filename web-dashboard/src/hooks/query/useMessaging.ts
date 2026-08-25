"use client"

import { useEffect, useRef, useState } from "react"
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query"
import { MessagingService, type ListConversationsFilters } from "@/services/messaging.service"
import { QUERY_KEYS } from "@/constants"
import { getPusherClient, isPusherConfigured } from "@/lib/pusher-client"
import { toast } from "sonner"

/** Lets the UI show the "SMS isn't configured yet" fallback proactively. */
export function useMessagingStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.STATUS,
    queryFn: () => MessagingService.getStatus(),
    // Only changes when an admin edits env vars and redeploys — no need to
    // poll aggressively. A failed check is treated as "unknown" by the
    // caller, not a crash.
    staleTime: 60_000,
    retry: false,
  })
}

/**
 * The business numbers this workspace can send US SMS from. Already filtered
 * server-side, so anything returned here is safe to offer as a "from".
 */
export function useMessagingNumbers() {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.NUMBERS,
    queryFn: () => MessagingService.listNumbers(),
    // Changes only when a number is added/removed on the Quo workspace, and
    // the backend already caches this for a few minutes.
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** Central inbox conversation list — polls as a fallback behind Pusher
 * real-time push. When Pusher is configured, push events invalidate the
 * query cache instantly; the poll is a safety net for missed events
 * (network blip, backgrounded tab). Raised to 30s from the original 5s
 * now that real-time is available. */
export function useConversations(filters?: ListConversationsFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.CONVERSATIONS(filters as Record<string, unknown> | undefined),
    queryFn: () => MessagingService.listConversations(filters),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  })
}

/** Patient modal's Messages tab — resolves (and lazily creates) the
 * conversation row for this patient's phone number. */
export function useConversationByPatient(patientId: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.CONVERSATION_BY_PATIENT(patientId ?? ""),
    queryFn: () => MessagingService.getConversationByPatient(patientId as string),
    enabled: !!patientId,
  })
}

/** Thread fetch. `enabled` lets callers poll ONLY while this thread is the
 * one actually open — the patient modal tab and the central inbox both pass
 * `enabled: false` for a thread that isn't currently visible. Polls at 10s
 * as a fallback behind Pusher real-time push (the per-thread channel
 * invalidates this query instantly on new messages). */
export function useConversationMessages(conversationId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.MESSAGES(conversationId ?? ""),
    queryFn: () => MessagingService.getMessages(conversationId as string),
    enabled: !!conversationId && options?.enabled !== false,
    refetchInterval: 10_000,
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      conversationId,
      content,
      phoneNumberId,
    }: { conversationId: string; content: string; phoneNumberId?: string }) =>
      MessagingService.sendMessage(conversationId, content, phoneNumberId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGING.MESSAGES(vars.conversationId) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGING.ALL })
    },
    onError: (err: any) => {
      // The backend returns this exact message (HTTP 503) when
      // QUO_API_KEY is unset or no US-capable number exists — surfaced
      // verbatim so a VA sees precisely why the send failed (never a silent
      // no-op), same as every other failed-send path.
      const message = err?.response?.data?.message || err?.message
      toast.error(message || "Failed to send message")
    },
  })
}

/**
 * On-demand call recording fetch — `enabled` gates it so nothing fires until
 * the "Listen recording" modal is actually open (a plain useQuery, not a
 * mutation — this is a read, and gating via `enabled` avoids the manual
 * effect+ref bookkeeping a mutation would need to fire "once per open").
 * Not polled or long-cached: no recording URL is meant to be reused later,
 * matching lib/quo.ts's getCallRecordings() note that URL lifetime is
 * undocumented — a fresh open re-fetches rather than serving a stale one.
 */
export function useCallRecording(callLogId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.CALL_RECORDING(callLogId ?? ""),
    queryFn: () => MessagingService.getCallRecording(callLogId as string),
    enabled: enabled && !!callLogId,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
}

/** On-demand call summary fetch — same enabled-gated pattern as
 *  useCallRecording. A `status: "absent"` response is a normal outcome (no
 *  summary generated / plan doesn't support it), not a query error — the
 *  modal renders that from the returned data, not from isError. */
export function useCallSummary(callLogId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.CALL_SUMMARY(callLogId ?? ""),
    queryFn: () => MessagingService.getCallSummary(callLogId as string),
    enabled: enabled && !!callLogId,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  })
}

export function useMarkConversationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => MessagingService.markRead(conversationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGING.ALL })
    },
    // Silent on error — marking read is a background nicety, not worth a toast.
  })
}

/**
 * Links an unmatched conversation to a patient from the /messages contact
 * panel. Invalidates the whole messaging tree so the row, thread header and
 * contact panel all flip to the linked state together, plus the patient
 * queries whose activity log now has the new audit entry.
 */
export function useLinkConversationPatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, patientId }: { conversationId: string; patientId: string }) =>
      MessagingService.linkPatient(conversationId, patientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGING.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Conversation linked to patient")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to link patient")
    },
  })
}

/**
 * Real-time messaging via Pusher. Subscribes to the private messaging
 * channel (conversation-list updates) and optionally a per-thread channel
 * (when a conversationId is provided). Invalidates the relevant React Query
 * caches on each event so the UI refetches immediately.
 *
 * Degrades to no-op when Pusher env vars are missing — the existing polling
 * intervals in useConversations/useConversationMessages keep everything
 * working.
 */
export function useRealtimeMessaging(conversationId?: string | null) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<"live" | "reconnecting" | "unavailable">(
    isPusherConfigured ? "reconnecting" : "unavailable",
  )
  const subscribedThreadRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isPusherConfigured) return
    const pusher = getPusherClient()
    if (!pusher) return

    // --- Connection state tracking ---
    const onConnected = () => setStatus("live")
    const onDisconnected = () => setStatus("reconnecting")
    const onReconnecting = () => setStatus("reconnecting")
    pusher.connection.bind("connected", onConnected)
    pusher.connection.bind("disconnected", onDisconnected)
    pusher.connection.bind("reconnecting", onReconnecting)

    // If already connected when we mount (e.g. hot reload), pick it up.
    if (pusher.connection.state === "connected") setStatus("live")

    // --- Conversation list channel ---
    const listChannel = pusher.subscribe("private-messaging")
    listChannel.bind("new-message", () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGING.ALL })
    })
    listChannel.bind("conversation-updated", () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGING.ALL })
    })

    return () => {
      pusher.connection.unbind("connected", onConnected)
      pusher.connection.unbind("disconnected", onDisconnected)
      pusher.connection.unbind("reconnecting", onReconnecting)
      pusher.unsubscribe("private-messaging")
    }
  }, [qc])

  // --- Per-thread channel (subscribes/unsubscribes as conversationId changes) ---
  useEffect(() => {
    if (!isPusherConfigured) return
    const pusher = getPusherClient()
    if (!pusher || !conversationId) return

    const channelName = `private-conversation-${conversationId}`
    const channel = pusher.subscribe(channelName)
    channel.bind("new-message", () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGING.MESSAGES(conversationId) })
    })
    subscribedThreadRef.current = conversationId

    return () => {
      pusher.unsubscribe(channelName)
      channel.unbind("new-message")
      subscribedThreadRef.current = null
    }
  }, [conversationId, qc])

  return { status }
}
