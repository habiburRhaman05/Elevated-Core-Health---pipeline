import axiosInstance from "@/lib/axios"
import { API_ENDPOINTS } from "@/constants"
import type {
  ApiResponse,
  SmsConversation,
  SmsConversationsResponse,
  SmsMessage,
  SmsMessagesResponse,
} from "@/types"

export interface ListConversationsFilters {
  page?: number
  limit?: number
  search?: string
  unmatchedOnly?: boolean
}

export const MessagingService = {
  async getStatus(): Promise<{ configured: boolean }> {
    const { data } = await axiosInstance.get<ApiResponse<{ configured: boolean }>>(
      API_ENDPOINTS.MESSAGING.STATUS,
    )
    return data.data
  },

  async listConversations(filters?: ListConversationsFilters): Promise<SmsConversationsResponse> {
    const { data } = await axiosInstance.get<ApiResponse<SmsConversationsResponse>>(
      API_ENDPOINTS.MESSAGING.CONVERSATIONS,
      { params: filters },
    )
    return data.data
  },

  async getConversationByPatient(patientId: string): Promise<{ conversation: SmsConversation | null }> {
    const { data } = await axiosInstance.get<ApiResponse<{ conversation: SmsConversation | null }>>(
      API_ENDPOINTS.MESSAGING.CONVERSATION_BY_PATIENT(patientId),
    )
    return data.data
  },

  async getMessages(conversationId: string, page = 1, limit = 100): Promise<SmsMessagesResponse> {
    const { data } = await axiosInstance.get<ApiResponse<SmsMessagesResponse>>(
      API_ENDPOINTS.MESSAGING.MESSAGES(conversationId),
      { params: { page, limit } },
    )
    return data.data
  },

  async sendMessage(conversationId: string, content: string): Promise<{ message: SmsMessage }> {
    const { data } = await axiosInstance.post<ApiResponse<{ message: SmsMessage }>>(
      API_ENDPOINTS.MESSAGING.SEND(conversationId),
      { content },
    )
    return data.data
  },

  async linkPatient(conversationId: string, patientId: string): Promise<{ conversation: SmsConversation }> {
    const { data } = await axiosInstance.patch<ApiResponse<{ conversation: SmsConversation }>>(
      API_ENDPOINTS.MESSAGING.LINK_PATIENT(conversationId),
      { patientId },
    )
    return data.data
  },

  async markRead(conversationId: string): Promise<{ conversation: SmsConversation }> {
    const { data } = await axiosInstance.post<ApiResponse<{ conversation: SmsConversation }>>(
      API_ENDPOINTS.MESSAGING.READ(conversationId),
    )
    return data.data
  },
}
