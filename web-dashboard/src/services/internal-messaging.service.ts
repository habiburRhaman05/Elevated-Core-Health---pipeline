import axiosInstance from "@/lib/axios"
import { API_ENDPOINTS } from "@/constants"
import type {
  ApiResponse,
  InternalConversation,
  InternalConversationsResponse,
  InternalMessage,
  InternalMessagesResponse,
  PendingInternalAttachment,
} from "@/types"

export const InternalMessagingService = {
  async getStatus(): Promise<{ attachmentsEnabled: boolean; realtimeEnabled: boolean }> {
    const { data } = await axiosInstance.get<ApiResponse<{ attachmentsEnabled: boolean; realtimeEnabled: boolean }>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.STATUS,
    )
    return data.data
  },

  async listConversations(): Promise<InternalConversationsResponse> {
    const { data } = await axiosInstance.get<ApiResponse<InternalConversationsResponse>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.CONVERSATIONS,
    )
    return data.data
  },

  /** Idempotent — finds the existing DM with this teammate, or creates one. */
  async startConversation(userId: string): Promise<{ conversation: InternalConversation }> {
    const { data } = await axiosInstance.post<ApiResponse<{ conversation: InternalConversation }>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.CONVERSATIONS,
      { userId },
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

  async sendMessage(
    conversationId: string,
    body: string | undefined,
    attachments?: PendingInternalAttachment[],
  ): Promise<{ message: InternalMessage }> {
    const { data } = await axiosInstance.post<ApiResponse<{ message: InternalMessage }>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.MESSAGES(conversationId),
      { body, attachments },
    )
    return data.data
  },

  async markRead(conversationId: string): Promise<{ conversationId: string }> {
    const { data } = await axiosInstance.patch<ApiResponse<{ conversationId: string }>>(
      API_ENDPOINTS.INTERNAL_MESSAGING.READ(conversationId),
    )
    return data.data
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
