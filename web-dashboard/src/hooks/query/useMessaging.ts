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

/** Central inbox conversation list — polls per the client's confirmed
 * realtime strategy (never WebSockets, see CLAUDE.md / requirements doc §3).
 * At the fast end of the confirmed 5-10s band (not below it) - a webhook
 * hitting our backend doesn't push to the browser on its own, so this is
 * still how new data actually reaches the UI within that architecture. */
export function useConversations(filters?: ListConversationsFilters) {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.CONVERSATIONS(filters as Record<string, unknown> | undefined),
    queryFn: () => MessagingService.listConversations(filters),
    refetchInterval: 5000,
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
 * `enabled: false` for a thread that isn't currently visible. Tightened to
 * 3s (below the documented 5-10s floor) specifically for the actively-open
 * thread, since that's the one spot where a slow poll is most noticeable -
 * closest we can get to "immediate" without WebSockets/SSE, which are ruled
 * out for this Vercel serverless deployment (see CLAUDE.md). */
export function useConversationMessages(conversationId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: QUERY_KEYS.MESSAGING.MESSAGES(conversationId ?? ""),
    queryFn: () => MessagingService.getMessages(conversationId as string),
    enabled: !!conversationId && options?.enabled !== false,
    refetchInterval: 3000,
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
