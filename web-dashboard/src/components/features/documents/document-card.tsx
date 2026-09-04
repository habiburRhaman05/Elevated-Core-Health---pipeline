"use client"

import { Download, Link as LinkIcon, MoreVertical, Pencil, PlayCircle, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DocumentItem } from "@/types"
import { formatDate, formatFileSize, iconForResourceType } from "./utils"

interface DocumentCardProps {
  doc: DocumentItem
  canUpload: boolean
  canDelete: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onCopyLink: () => void
  onRename: () => void
  onDeleteRequest: () => void
  onPreview: () => void
}

/** Shared dropdown menu — identical for both card layouts below. */
function DocumentMenu({
  doc,
  canUpload,
  canDelete,
  onCopyLink,
  onRename,
  onDeleteRequest,
  onCloseMenu,
}: Pick<DocumentCardProps, "doc" | "canUpload" | "canDelete" | "onCopyLink" | "onRename" | "onDeleteRequest" | "onCloseMenu">) {
  return (
    <div className="absolute right-0 top-8 z-20 w-40 bg-white border border-[#E5E7EB] rounded-xl shadow-lg overflow-hidden py-1">
      <button
        onClick={onCopyLink}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
      >
        <LinkIcon className="w-3.5 h-3.5" /> Copy link
      </button>
      <a
        href={doc.url}
        target="_blank"
        rel="noreferrer"
        onClick={onCloseMenu}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
      >
        <Download className="w-3.5 h-3.5" /> Open / Download
      </a>
      {canUpload && (
        <button
          onClick={onRename}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
        >
          <Pencil className="w-3.5 h-3.5" /> Rename
        </button>
      )}
      {canDelete && (
        <button
          onClick={onDeleteRequest}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      )}
    </div>
  )
}

export function DocumentCard(props: DocumentCardProps) {
  const { doc, menuOpen, onToggleMenu, onCloseMenu, onPreview } = props
  const isPreviewable = doc.resourceType === "image" || doc.resourceType === "video"

  return (
    // No overflow-hidden here — the 3-dot menu below is absolutely positioned
    // and needs to pop out past the card's edge. Only the thumbnail (which
    // needs its top corners clipped to match the card's rounding) gets it.
    <div className="group relative bg-white rounded-xl border border-[#E5E7EB] hover:shadow-sm transition-all">
      {isPreviewable ? (
        <button
          type="button"
          onClick={onPreview}
          className="relative block w-full h-28 bg-[#F4F5F7] overflow-hidden rounded-t-xl"
          title={`Preview ${doc.fileName}`}
        >
          {doc.resourceType === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary URL, no static optimization needed
            <img
              src={doc.url}
              alt={doc.fileName}
              loading="lazy"
              className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#1A1B1E]">
              <PlayCircle className="w-9 h-9 text-white/80" />
            </div>
          )}
        </button>
      ) : (
        <a
          href={doc.url}
          target="_blank"
          rel="noreferrer"
          className="h-28 bg-[#F4F5F7] flex items-center justify-center rounded-t-xl overflow-hidden"
          title={`Open ${doc.fileName}`}
        >
          {(() => {
            const { Icon, color, bg } = iconForResourceType(doc.resourceType, doc.mimeType)
            return (
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", bg)}>
                <Icon className={cn("w-6 h-6", color)} />
              </div>
            )
          })()}
        </a>
      )}

      <div className="p-3 pr-9 relative">
        <p className="text-sm font-semibold text-[#1A1B1E] truncate" title={doc.fileName}>
          {doc.fileName}
        </p>
        <p className="text-[11px] text-[#6B7280]">
          {formatFileSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {doc.patient && (
            <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
              {doc.patient.name}
            </span>
          )}
          {doc.uploadedBy && <p className="text-[10px] text-[#9CA3AF]">by {doc.uploadedBy.name}</p>}
        </div>

        <div className="absolute top-2.5 right-2.5">
          <button onClick={onToggleMenu} className="p-1 rounded-lg hover:bg-gray-100 text-[#6B7280]">
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={onCloseMenu} />
              <DocumentMenu {...props} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
