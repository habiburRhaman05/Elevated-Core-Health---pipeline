import axiosInstance from "@/lib/axios"
import { API_ENDPOINTS } from "@/constants"
import type { ApiResponse, Patient, ChecklistItemDef } from "@/types"

export const PatientsService = {
  async list(stage?: string): Promise<Patient[]> {
    const params = stage ? { stage } : {}
    const { data } = await axiosInstance.get<ApiResponse<Patient[]>>(
      API_ENDPOINTS.PATIENTS,
      { params },
    )
    return data.data
  },

  async getById(id: string): Promise<Patient> {
    const { data } = await axiosInstance.get<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}`,
    )
    return data.data
  },

  async moveStage(id: string, targetStage: string): Promise<Patient> {
    const { data } = await axiosInstance.patch<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/stage`,
      { targetStage },
    )
    return data.data
  },

  async assign(id: string, assignedTo: string | null): Promise<Patient> {
    const { data } = await axiosInstance.patch<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/assign`,
      { assignedTo },
    )
    return data.data
  },

  async toggleChecklist(id: string, itemId: string, checked: boolean): Promise<Patient> {
    const { data } = await axiosInstance.patch<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/checklist`,
      { itemId, checked },
    )
    return data.data
  },

  async updateNotes(id: string, notes: string): Promise<Patient> {
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/notes`,
      { notes },
    )
    return data.data
  },

  async flag(id: string, reason: string): Promise<Patient> {
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/flag`,
      { reason },
    )
    return data.data
  },

  async clearFlag(id: string): Promise<Patient> {
    const { data } = await axiosInstance.patch<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/flag/clear`,
    )
    return data.data
  },

  async claim(id: string, userId: string): Promise<Patient> {
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/claim`,
      { userId },
    )
    return data.data
  },

  async getChecklistItems(): Promise<ChecklistItemDef[]> {
    const { data } = await axiosInstance.get<ApiResponse<ChecklistItemDef[]>>(
      `${API_ENDPOINTS.PATIENTS}/checklist-items`,
    )
    return data.data
  },

  async intake(input: {
    name: string
    email?: string | null
    phone?: string | null
    appointmentDatetime?: string | null
    bookingPlatform?: string | null
    problemDescription?: string | null
  }, webhookSecret?: string): Promise<Patient> {
    const headers: Record<string, string> = {}
    if (webhookSecret) {
      headers["x-webhook-secret"] = webhookSecret
    }
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      webhookSecret ? API_ENDPOINTS.PATIENTS_INTAKE : API_ENDPOINTS.PATIENTS_INTAKE_TEST,
      input,
      { headers },
    )
    return data.data
  },
}
