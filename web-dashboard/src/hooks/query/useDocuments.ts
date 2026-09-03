"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { DocumentsService, type ListDocumentsParams } from "@/services/documents.service"
import { QUERY_KEYS } from "@/constants"

export function useFolders(parentId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.DOCUMENTS.FOLDERS(parentId),
    queryFn: () => DocumentsService.listFolders(parentId),
  })
}

export function useCreateFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, parentFolderId }: { name: string; parentFolderId?: string | null }) =>
      DocumentsService.createFolder(name, parentFolderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", "folders"] })
      toast.success("Folder created")
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Failed to create folder"),
  })
}

export function useRenameFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => DocumentsService.renameFolder(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", "folders"] })
      toast.success("Folder renamed")
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Failed to rename folder"),
  })
}

export function useDeleteFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => DocumentsService.deleteFolder(id, force),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", "folders"] })
      qc.invalidateQueries({ queryKey: ["documents", "list"] })
      toast.success("Folder deleted")
    },
    onError: (error: any) => {
      // A 409 here carries a specific "N files, M subfolders" message the
      // caller uses to prompt for the force-confirm — don't toast it as a
      // generic failure, let the caller decide.
      if (error?.response?.status !== 409) {
        toast.error(error?.response?.data?.message || "Failed to delete folder")
      }
    },
  })
}

export function useDocuments(params: ListDocumentsParams) {
  return useQuery({
    queryKey: QUERY_KEYS.DOCUMENTS.LIST(JSON.stringify(params)),
    queryFn: () => DocumentsService.list(params),
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, folderId, patientId }: { file: File; folderId?: string; patientId?: string }) =>
      DocumentsService.upload(file, { folderId, patientId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] })
      toast.success("Document uploaded")
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Failed to upload document"),
  })
}

export function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: { fileName?: string; folderId?: string | null } }) =>
      DocumentsService.update(id, changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] })
      toast.success("Document updated")
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Failed to update document"),
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => DocumentsService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] })
      toast.success("Document deleted")
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Failed to delete document"),
  })
}
