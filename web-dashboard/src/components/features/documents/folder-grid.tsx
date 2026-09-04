"use client"

import { Folder, MoreVertical, Pencil, Trash2 } from "lucide-react"
import type { DocumentFolder } from "@/types"
import type { BreadcrumbEntry } from "./types"

interface FolderGridProps {
  folders: DocumentFolder[]
  isAdmin: boolean
  openMenuId: string | null
  onOpen: (entry: BreadcrumbEntry) => void
  onToggleMenu: (id: string) => void
  onCloseMenu: () => void
  onRename: (folder: DocumentFolder) => void
  onDeleteRequest: (folder: DocumentFolder) => void
}

export function FolderGrid({
  folders,
  isAdmin,
  openMenuId,
  onOpen,
  onToggleMenu,
  onCloseMenu,
  onRename,
  onDeleteRequest,
}: FolderGridProps) {
  if (folders.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {folders.map((folder) => (
        <div
          key={folder.id}
          className="group relative bg-white rounded-xl border border-[#E5E7EB] p-3.5 hover:border-[#65BD6C]/40 hover:shadow-sm transition-all cursor-pointer"
          onClick={() => onOpen({ id: folder.id, name: folder.name })}
        >
          <div className="flex items-center gap-2.5 pr-6">
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
            <div className="absolute top-2.5 right-2.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onToggleMenu(folder.id)}
                className="p-1 rounded-lg hover:bg-gray-100 text-[#6B7280]"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {openMenuId === folder.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={onCloseMenu} />
                  <div className="absolute right-0 top-7 z-20 w-36 bg-white border border-[#E5E7EB] rounded-xl shadow-lg overflow-hidden py-1">
                    <button
                      onClick={() => onRename(folder)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Rename
                    </button>
                    <button
                      onClick={() => onDeleteRequest(folder)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
