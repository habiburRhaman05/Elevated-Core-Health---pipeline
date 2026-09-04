import type { DocumentItem } from "@/types"

export interface BreadcrumbEntry {
  id: string
  name: string
}

export type SortOption = "name_asc" | "name_desc" | "date_new" | "date_old" | "size_large" | "size_small"

export const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "date_new", label: "Newest first" },
  { value: "date_old", label: "Oldest first" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "size_large", label: "Size (largest)" },
  { value: "size_small", label: "Size (smallest)" },
]

export interface UploadQueueItem {
  id: string
  fileName: string
  status: "uploading" | "done" | "error"
  error?: string
}

/** A single client-side upload target, kept generic so the dropzone doesn't need to know about patients/folders. */
export interface PendingUpload {
  file: File
  folderId?: string
  patientId?: string
}

export type DocSortable = Pick<DocumentItem, "fileName" | "createdAt" | "sizeBytes">
