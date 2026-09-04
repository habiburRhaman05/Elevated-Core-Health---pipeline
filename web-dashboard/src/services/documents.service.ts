import axiosInstance from "@/lib/axios"
import { API_ENDPOINTS } from "@/constants"
import type { ApiResponse, DocumentFolder, DocumentItem, DocumentResourceType } from "@/types"

export interface ListDocumentsParams {
  folderId?: string
  patientId?: string
  search?: string
  type?: DocumentResourceType
}

export const DocumentsService = {
  async listFolders(parentId?: string): Promise<DocumentFolder[]> {
    const { data } = await axiosInstance.get<ApiResponse<DocumentFolder[]>>(API_ENDPOINTS.DOCUMENTS.FOLDERS, {
      params: parentId ? { parentId } : {},
    })
    return data.data
  },

  async createFolder(name: string, parentFolderId?: string | null): Promise<DocumentFolder> {
    const { data } = await axiosInstance.post<ApiResponse<DocumentFolder>>(API_ENDPOINTS.DOCUMENTS.FOLDERS, {
      name,
      parentFolderId,
    })
    return data.data
  },

  async renameFolder(id: string, name: string): Promise<DocumentFolder> {
    const { data } = await axiosInstance.patch<ApiResponse<DocumentFolder>>(API_ENDPOINTS.DOCUMENTS.FOLDER(id), { name })
    return data.data
  },

  async deleteFolder(id: string, force = false): Promise<void> {
    await axiosInstance.delete(API_ENDPOINTS.DOCUMENTS.FOLDER(id), { params: force ? { force: "true" } : {} })
  },

  async list(params: ListDocumentsParams): Promise<DocumentItem[]> {
    const { data } = await axiosInstance.get<ApiResponse<DocumentItem[]>>(API_ENDPOINTS.DOCUMENTS.LIST, { params })
    return data.data
  },

  async upload(file: File, opts: { folderId?: string; patientId?: string }): Promise<DocumentItem> {
    const form = new FormData()
    form.append("file", file)
    if (opts.folderId) form.append("folderId", opts.folderId)
    if (opts.patientId) form.append("patientId", opts.patientId)
    const { data } = await axiosInstance.post<ApiResponse<DocumentItem>>(API_ENDPOINTS.DOCUMENTS.UPLOAD, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return data.data
  },

  async update(id: string, changes: { fileName?: string; folderId?: string | null }): Promise<DocumentItem> {
    const { data } = await axiosInstance.patch<ApiResponse<DocumentItem>>(API_ENDPOINTS.DOCUMENTS.ITEM(id), changes)
    return data.data
  },

  async delete(id: string): Promise<void> {
    await axiosInstance.delete(API_ENDPOINTS.DOCUMENTS.ITEM(id))
  },
}
