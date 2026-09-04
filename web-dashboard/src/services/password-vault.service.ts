import axiosInstance from "@/lib/axios"
import { API_ENDPOINTS } from "@/constants"
import type { ApiResponse, PasswordEntry, PasswordGroup } from "@/types"

export interface CreateEntryPayload {
  name: string
  username?: string | null
  password: string
  notes?: string | null
  groupId?: string | null
  userIds: string[]
}

export interface UpdateEntryPayload {
  name?: string
  username?: string | null
  password?: string
  notes?: string | null
  groupId?: string | null
}

export const PasswordVaultService = {
  // ---- Admin: groups ----
  async listGroups(): Promise<PasswordGroup[]> {
    const { data } = await axiosInstance.get<ApiResponse<PasswordGroup[]>>(API_ENDPOINTS.PASSWORD_VAULT.GROUPS)
    return data.data
  },
  async createGroup(name: string): Promise<PasswordGroup> {
    const { data } = await axiosInstance.post<ApiResponse<PasswordGroup>>(API_ENDPOINTS.PASSWORD_VAULT.GROUPS, { name })
    return data.data
  },
  async renameGroup(id: string, name: string): Promise<PasswordGroup> {
    const { data } = await axiosInstance.patch<ApiResponse<PasswordGroup>>(API_ENDPOINTS.PASSWORD_VAULT.GROUP(id), { name })
    return data.data
  },
  async deleteGroup(id: string): Promise<void> {
    await axiosInstance.delete(API_ENDPOINTS.PASSWORD_VAULT.GROUP(id))
  },
  async setGroupAccess(id: string, userIds: string[]): Promise<void> {
    await axiosInstance.patch(API_ENDPOINTS.PASSWORD_VAULT.GROUP_ACCESS(id), { userIds })
  },

  // ---- Admin: entries ----
  async listEntries(): Promise<PasswordEntry[]> {
    const { data } = await axiosInstance.get<ApiResponse<PasswordEntry[]>>(API_ENDPOINTS.PASSWORD_VAULT.ENTRIES)
    return data.data
  },
  async createEntry(payload: CreateEntryPayload): Promise<PasswordEntry> {
    const { data } = await axiosInstance.post<ApiResponse<PasswordEntry>>(API_ENDPOINTS.PASSWORD_VAULT.ENTRIES, payload)
    return data.data
  },
  async updateEntry(id: string, payload: UpdateEntryPayload): Promise<PasswordEntry> {
    const { data } = await axiosInstance.patch<ApiResponse<PasswordEntry>>(API_ENDPOINTS.PASSWORD_VAULT.ENTRY(id), payload)
    return data.data
  },
  async deleteEntry(id: string): Promise<void> {
    await axiosInstance.delete(API_ENDPOINTS.PASSWORD_VAULT.ENTRY(id))
  },
  async setEntryAccess(id: string, userIds: string[]): Promise<void> {
    await axiosInstance.patch(API_ENDPOINTS.PASSWORD_VAULT.ENTRY_ACCESS(id), { userIds })
  },
  async revealEntry(id: string): Promise<string> {
    const { data } = await axiosInstance.get<ApiResponse<{ password: string }>>(API_ENDPOINTS.PASSWORD_VAULT.ENTRY_REVEAL(id))
    return data.data.password
  },

  // ---- VA: read-only, server-filtered ----
  async listMyEntries(): Promise<PasswordEntry[]> {
    const { data } = await axiosInstance.get<ApiResponse<PasswordEntry[]>>(API_ENDPOINTS.PASSWORD_VAULT.MY_ENTRIES)
    return data.data
  },
  async revealMyEntry(id: string): Promise<string> {
    const { data } = await axiosInstance.get<ApiResponse<{ password: string }>>(
      API_ENDPOINTS.PASSWORD_VAULT.MY_ENTRY_REVEAL(id),
    )
    return data.data.password
  },
}
