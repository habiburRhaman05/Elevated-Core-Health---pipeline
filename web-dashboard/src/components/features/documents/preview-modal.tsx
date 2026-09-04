"use client"

import { X, ExternalLink } from "lucide-react"
import type { DocumentItem } from "@/types"

interface PreviewModalProps {
  doc: DocumentItem | null
  onClose: () => void
}

/** Full-screen in-app lightbox for image/video documents — opened by clicking the card's thumbnail. */
export function PreviewModal({ doc, onClose }: PreviewModalProps) {
  if (!doc) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-sm font-semibold text-white truncate" title={doc.fileName}>
            {doc.fileName}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-xl bg-black/40">
          {doc.resourceType === "video" ? (
            <video src={doc.url} controls autoPlay className="max-w-full max-h-[80vh] rounded-xl" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary URL, no static optimization needed
            <img src={doc.url} alt={doc.fileName} className="max-w-full max-h-[80vh] object-contain rounded-xl" />
          )}
        </div>
      </div>
    </div>
  )
}
