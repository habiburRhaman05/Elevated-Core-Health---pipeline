"use client"

import type { DocumentItem } from "@/types"
import { DocumentCard } from "./document-card"

interface DocumentGridProps {
  documents: DocumentItem[]
  canUpload: boolean
  canDelete: boolean
  openMenuId: string | null
  onToggleMenu: (id: string) => void
  onCloseMenu: () => void
  onCopyLink: (doc: DocumentItem) => void
  onRename: (doc: DocumentItem) => void
  onDeleteRequest: (doc: DocumentItem) => void
  onPreview: (doc: DocumentItem) => void
}

export function DocumentGrid({
  documents,
  canUpload,
  canDelete,
  openMenuId,
  onToggleMenu,
  onCloseMenu,
  onCopyLink,
  onRename,
  onDeleteRequest,
  onPreview,
}: DocumentGridProps) {
  if (documents.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          doc={doc}
          canUpload={canUpload}
          canDelete={canDelete}
          menuOpen={openMenuId === doc.id}
          onToggleMenu={() => onToggleMenu(doc.id)}
          onCloseMenu={onCloseMenu}
          onCopyLink={() => onCopyLink(doc)}
          onRename={() => onRename(doc)}
          onDeleteRequest={() => onDeleteRequest(doc)}
          onPreview={() => onPreview(doc)}
        />
      ))}
    </div>
  )
}
