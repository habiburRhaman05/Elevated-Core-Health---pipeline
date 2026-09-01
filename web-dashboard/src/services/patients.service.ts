import axiosInstance from "@/lib/axios"
import { API_ENDPOINTS } from "@/constants"
import type { ApiResponse, AppointmentHistoryEntry, Patient, ChecklistItemDef, VaUser } from "@/types"

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

  /** Full appointment history for the modal's Appointment History tab. Empty
   *  array for a patient with no bookings tracked yet (nothing before this
   *  feature shipped has any rows) — never a 404 for that case. */
  async getAppointmentHistory(id: string): Promise<AppointmentHistoryEntry[]> {
    const { data } = await axiosInstance.get<ApiResponse<AppointmentHistoryEntry[]>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/appointment-history`,
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

  async addNote(id: string, content: string): Promise<Patient> {
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/notes`,
      { content },
    )
    return data.data
  },

  async deleteNote(id: string, noteId: string): Promise<Patient> {
    const { data } = await axiosInstance.delete<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/notes/${noteId}`,
    )
    return data.data
  },

  async flag(
    id: string,
    reason: string,
    type: "positive" | "negative" = "negative",
  ): Promise<Patient> {
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/flag`,
      { reason, type },
    )
    return data.data
  },

  async clearFlag(id: string, clearReason: string, flagId?: string): Promise<Patient> {
    const { data } = await axiosInstance.patch<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/flag/clear`,
      // flagId targets ONE specific flag in history — without it the backend
      // clears only the most recent open flag, never all of them.
      { clearReason, ...(flagId ? { flagId } : {}) },
    )
    return data.data
  },

  async updatePatient(
    id: string,
    input: Partial<{
      firstName: string | null
      lastName: string | null
      location: string | null
      email: string | null
      phone: string | null
      dateOfBirth: string | null
      copayAmount: string | null
      amountPaid: string | null
      paymentMethod: string | null
      insuranceProvider: string | null
      visitStatus: string
    }>,
  ): Promise<Patient> {
    const { data } = await axiosInstance.patch<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}`,
      input,
    )
    return data.data
  },

  async lockPatient(id: string): Promise<Patient> {
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/lock`,
    )
    return data.data
  },

  async unlockPatient(id: string): Promise<Patient> {
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/unlock`,
    )
    return data.data
  },

  async updateStatus(id: string, input: { status: "active" | "cancelled"; reason?: string | null }): Promise<Patient> {
    const { data } = await axiosInstance.patch<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/status`,
      input,
    )
    return data.data
  },

  async listVas(): Promise<VaUser[]> {
    const { data } = await axiosInstance.get<ApiResponse<VaUser[]>>(
      "/users/vas",
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

  async checkEligibility(
    id: string,
    input?: {
      paymentMethod?: string | null
      insuranceProvider?: string | null
      paymentDetails?: Record<string, unknown> | null
    },
  ): Promise<Patient> {
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      API_ENDPOINTS.PATIENT_CHECK_ELIGIBILITY(id),
      input ?? {},
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
    paymentMethod?: string | null
    insuranceProvider?: string | null
    paymentDetails?: Record<string, unknown> | null
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

  async addPatient(input: {
    // firstName/lastName are the source of truth — the backend splits a legacy
    // `name` if provided, but the Add Patient form always sends the parts.
    firstName: string
    lastName?: string | null
    email?: string | null
    phone?: string | null
    location?: string | null
    dateOfBirth?: string | null
    appointmentDatetime?: string | null
    bookingPlatform?: string | null
    assignedTo?: string | null
    paymentMethod?: string | null
    insuranceProvider?: string | null
    visitStatus?: string | null
    problemDescription?: string | null
  }): Promise<Patient> {
    const { data } = await axiosInstance.post<ApiResponse<Patient>>(
      API_ENDPOINTS.PATIENTS,
      input,
    )
    return data.data
  },

  async updateAppointment(id: string, appointmentDatetime: string): Promise<Patient> {
    const { data } = await axiosInstance.patch<ApiResponse<Patient>>(
      `${API_ENDPOINTS.PATIENTS}/${id}/appointment`,
      { appointmentDatetime },
    )
    return data.data
  },
}
