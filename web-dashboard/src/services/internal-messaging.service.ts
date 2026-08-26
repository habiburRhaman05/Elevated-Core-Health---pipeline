import axiosInstance from "@/lib/axios"
import { API_ENDPOINTS } from "@/constants"
import type {
  ApiResponse,
  InternalMessage,
  InternalMessagesResponse,
  InternalMessageTarget,
  InternalRosterResponse,
  PendingInternalAttachment,
} from "@/types"

interface SendMessageInput {
  body?: string
  attachments?: PendingInternalAttachment[]
  replyToId?: string
}

interface SendMessageResult {
  message: InternalMessage
  conversation: { id: string; isNew: boolean }
}

export const InternalMessagingService = {
  async getStatus(): Promise<{ attachmentsEnabled: boolean; realtimeEnabled: boolean }> {
    const { data } = await axiosInstance.get<ApiResponse<{ attachmentsEnabled: boolean; realtimeEnabled: boolean }>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.STATUS,
    )
    return data.data
  },

  /** Phase 2 — every teammate merged with their DM status. */
  async getRoster(): Promise<InternalRosterResponse> {
    const { data } = await axiosInstance.get<ApiResponse<InternalRosterResponse>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.ROSTER,
    )
    return data.data
  },

  async getMessages(conversationId: string, page = 1, limit = 50): Promise<InternalMessagesResponse> {
    const { data } = await axiosInstance.get<ApiResponse<InternalMessagesResponse>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.MESSAGES(conversationId),
      { params: { page, limit } },
    )
    return data.data
  },

  /**
   * Sends into an existing conversation, or — when `target` is a
   * `recipientUserId` (no conversation yet) — hits the lazy-create endpoint
   * instead. Either way the response's `conversation.id` is the real id to
   * use for every message after this one.
   */
  async sendMessage(target: InternalMessageTarget, input: SendMessageInput): Promise<SendMessageResult> {
    const url =
      "conversationId" in target
        ? API_ENDPOINTS.INTERNAL_MESSAGING.MESSAGES(target.conversationId)
        : API_ENDPOINTS.INTERNAL_MESSAGING.SEND_LAZY
    const body = "conversationId" in target ? input : { ...input, recipientUserId: target.recipientUserId }
    const { data } = await axiosInstance.post<ApiResponse<SendMessageResult>>(url, body)
    return data.data
  },

  async markRead(conversationId: string): Promise<{ conversationId: string }> {
    const { data } = await axiosInstance.patch<ApiResponse<{ conversationId: string }>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.READ(conversationId),
    )
    return data.data
  },

  /** Fire-and-forget typing ping — errors are never surfaced to the user,
   *  this is a pure nicety. */
  async sendTyping(target: InternalMessageTarget): Promise<void> {
    const body = "conversationId" in target ? { conversationId: target.conversationId } : { recipientUserId: target.recipientUserId }
    await axiosInstance.post(API_ENDPOINTS.INTERNAL_MESSAGING.TYPING, body)
  },

  /** Uploads one file and returns its metadata — no message is created yet.
   *  `onProgress` (0-100) drives the composer's per-file progress bar. */
  async uploadAttachment(file: File, onProgress?: (percent: number) => void): Promise<PendingInternalAttachment> {
    const formData = new FormData()
    formData.append("file", file)
    const { data } = await axiosInstance.post<ApiResponse<PendingInternalAttachment>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.UPLOADS,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (evt) => {
          if (!onProgress || !evt.total) return
          onProgress(Math.round((evt.loaded / evt.total) * 100))
        },
      },
    )
    return data.data
  },
}
