"use client"

import { FolderPlus, Search, Upload, Loader2, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DocumentResourceType } from "@/types"
import { SORT_OPTIONS, type SortOption } from "./types"

interface DocumentsToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  typeFilter: DocumentResourceType | ""
  onTypeFilterChange: (value: DocumentResourceType | "") => void
  sortBy: SortOption
  onSortByChange: (value: SortOption) => void
  isAdmin: boolean
  canUpload: boolean
  isUploading: boolean
  onNewFolderClick: () => void
  onUploadClick: () => void
}

const TYPE_FILTERS: Array<{ value: DocumentResourceType | "all"; label: string }> = [
  { value: "all", label: "All types" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "raw", label: "Documents" },
]

export function DocumentsToolbar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  sortBy,
  onSortByChange,
  isAdmin,
  canUpload,
  isUploading,
  onNewFolderClick,
  onUploadClick,
}: DocumentsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 justify-between">
      <div className="flex items-center gap-2 flex-1 min-w-[200px] flex-wrap">
        <div className="relative flex-1 max-w-xs min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#036638]/30"
          />
        </div>

        <Select
          value={typeFilter || "all"}
          onValueChange={(v) => onTypeFilterChange(v === "all" ? "" : (v as DocumentResourceType))}
        >
          <SelectTrigger className="w-[130px] h-9 rounded-lg border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] shadow-none focus:ring-2 focus:ring-[#036638]/30 cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortOption)}>
          <SelectTrigger className="w-[160px] h-9 rounded-lg border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] shadow-none focus:ring-2 focus:ring-[#036638]/30 cursor-pointer gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={onNewFolderClick} className="gap-1.5">
            <FolderPlus className="w-4 h-4" />
            New Folder
          </Button>
        )}
        {canUpload && (
          <Button
            size="sm"
            onClick={onUploadClick}
            disabled={isUploading}
            className="bg-[#036638] hover:bg-[#025030] text-white gap-1.5"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </Button>
        )}
      </div>
    </div>
  )
}
