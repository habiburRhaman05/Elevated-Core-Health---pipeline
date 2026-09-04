"use client"

import { Folder, Pencil, Trash2 } from "lucide-react"
import type { DocumentFolder } from "@/types"
import type { BreadcrumbEntry } from "./types"

interface FolderGridProps {
  folders: DocumentFolder[]
  isAdmin: boolean
  onOpen: (entry: BreadcrumbEntry) => void
  onRename: (folder: DocumentFolder) => void
  onDeleteRequest: (folder: DocumentFolder) => void
}

export function FolderGrid({ folders, isAdmin, onOpen, onRename, onDeleteRequest }: FolderGridProps) {
  if (folders.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {folders.map((folder) => (
        <div
          key={folder.id}
          className="group relative bg-white rounded-xl border border-[#E5E7EB] p-3.5 hover:border-[#65BD6C]/40 hover:shadow-sm transition-all cursor-pointer"
          onClick={() => onOpen({ id: folder.id, name: folder.name })}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-[#EBF7EC] flex items-center justify-center shrink-0">
              <Folder className="w-5 h-5 text-[#036638]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1A1B1E] truncate">{folder.name}</p>
              <p className="text-[11px] text-[#6B7280]">
                {folder._count.documents} file{folder._count.documents !== 1 ? "s" : ""}
                {folder._count.children > 0 && `, ${folder._count.children} folder${folder._count.children !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          {isAdmin && (
            <div
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onRename(folder)}
                className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] hover:bg-[#EBF7EC] text-[#6B7280] hover:text-[#036638]"
                title="Rename folder"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDeleteRequest(folder)}
                className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] hover:bg-red-50 text-[#6B7280] hover:text-red-500"
                title="Delete folder"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
