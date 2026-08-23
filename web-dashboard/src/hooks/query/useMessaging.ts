"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query"
import { MessagingService, type ListConversationsFilters } from "@/services/messaging.service"
import { QUERY_KEYS } from "@/constants"
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

/** Central inbox conversation list — polls per the client's confirmed
 * realtime strategy (5-10s), never WebSockets (see CLAUDE.md / requirements doc §3). */
export function useConversations(filters?: ListConversationsFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.CONVERSATIONS(filters as Record<string, unknown> | undefined),
    queryFn: () => MessagingService.listConversations(filters),
    refetchInterval: 8000,
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
 * `enabled: false` for a thread that isn't currently visible. */
export function useConversationMessages(conversationId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.MESSAGES(conversationId ?? ""),
    queryFn: () => MessagingService.getMessages(conversationId as string),
    enabled: !!conversationId && options?.enabled !== false,
    refetchInterval: 5000,
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, content }: { conversationId: string; content: string }) =>
      MessagingService.sendMessage(conversationId, content),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGING.MESSAGES(vars.conversationId) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.MESSAGING.ALL })
    },
    onError: (err: any) => {
      // The backend returns this exact message (HTTP 503) when
      // QUO_API_KEY/QUO_FROM_NUMBER/QUO_USER_ID aren't set — surfaced
      // verbatim so a VA sees precisely why the send failed (never a silent
      // no-op), same as every other failed-send path.
      const message = err?.response?.data?.message || err?.message
      toast.error(message || "Failed to send message")
    },
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
