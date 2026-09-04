import { FileText, FileImage, FileVideo, File as FileIcon } from "lucide-react"
import type { DocumentResourceType } from "@/types"
import type { DocSortable, SortOption } from "./types"

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function iconForResourceType(type: DocumentResourceType, mimeType: string) {
  if (type === "image") return { Icon: FileImage, color: "text-purple-500", bg: "bg-purple-50" }
  if (type === "video") return { Icon: FileVideo, color: "text-blue-500", bg: "bg-blue-50" }
  if (mimeType === "application/pdf") return { Icon: FileText, color: "text-red-500", bg: "bg-red-50" }
  return { Icon: FileIcon, color: "text-[#6B7280]", bg: "bg-gray-50" }
}

/** Sorts a copy of the given list — never mutates the query-cached array in place. */
export function sortDocuments<T extends DocSortable>(items: T[], sortBy: SortOption): T[] {
  const sorted = [...items]
  switch (sortBy) {
    case "name_asc":
      return sorted.sort((a, b) => a.fileName.localeCompare(b.fileName))
    case "name_desc":
      return sorted.sort((a, b) => b.fileName.localeCompare(a.fileName))
    case "date_old":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    case "size_large":
      return sorted.sort((a, b) => b.sizeBytes - a.sizeBytes)
    case "size_small":
      return sorted.sort((a, b) => a.sizeBytes - b.sizeBytes)
    default:
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
}

/** Folders have no size — name/date sorts apply, size sorts fall back to name so the order stays sensible. */
export function sortFolders<T extends { name: string; createdAt: string }>(items: T[], sortBy: SortOption): T[] {
  const sorted = [...items]
  switch (sortBy) {
    case "name_desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name))
    case "date_old":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    case "date_new":
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    default:
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
  }
}
