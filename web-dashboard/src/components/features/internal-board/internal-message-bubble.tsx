"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { AlertTriangle, Download, File as FileIcon, Loader2, X } from "lucide-react"
import { cn, formatMessageTimestamp } from "@/lib/utils"
import { InternalAvatar } from "./internal-avatar"
import type { InternalAttachment, InternalMessage } from "@/types"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentTile({ attachment, onOpenImage }: { attachment: InternalAttachment; onOpenImage: (url: string) => void }) {
  if (attachment.type === "image") {
    return (
      <button
        type="button"
        onClick={() => onOpenImage(attachment.url)}
        className="block rounded-xl overflow-hidden border border-black/5 max-w-[240px] hover:opacity-95 transition-opacity"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary-hosted, per-message, not worth next/image config here */}
        <img src={attachment.url} alt={attachment.fileName} className="max-w-full max-h-[260px] object-cover block" />
      </button>
    )
  }

  if (attachment.type === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: user-uploaded chat video, no caption track exists
      <video
        controls
        preload="metadata"
        poster={attachment.thumbnailUrl ?? undefined}
        className="rounded-xl max-w-[260px] max-h-[280px] border border-black/5 bg-black"
      >
        <source src={attachment.url} type={attachment.mimeType} />
      </video>
    )
  }

  if (attachment.type === "audio") {
    return (
      <div className="w-[240px] rounded-xl border border-gray-100 bg-gray-50 p-2.5">
        {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded voice/audio clip, no caption track exists */}
        <audio controls src={attachment.url} className="w-full h-9" />
        <p className="text-[10px] text-[#9CA3AF] mt-1 truncate">{attachment.fileName}</p>
      </div>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      download={attachment.fileName}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors w-[240px]"
    >
      <span className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
        <FileIcon className="w-4 h-4 text-[#6B7280]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#374151] truncate">{attachment.fileName}</p>
        <p className="text-[10px] text-[#9CA3AF]">{formatFileSize(attachment.sizeBytes)}</p>
      </div>
      <Download className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
    </a>
  )
}

/** Full-screen lightbox for a tapped image attachment — its own tiny modal
 *  rather than pulling in the shared Dialog primitive, since this needs a
 *  near-black backdrop and no card chrome. */
function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- lightbox preview of an already-loaded chat image */}
      <img
        src={url}
        alt=""
        className="max-w-full max-h-full rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  )
}

export function InternalMessageBubble({
  message,
  isOwn,
}: {
  message: InternalMessage
  isOwn: boolean
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const isSending = message.status === "sending"
  const isFailed = message.status === "failed"
  const hasBody = !!message.body?.trim()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn("group flex items-end gap-2", isOwn ? "flex-row-reverse" : "flex-row")}
    >
      <InternalAvatar name={message.sender.name} colorKey={message.sender.id} avatarUrl={message.sender.avatar} size="sm" />

      <div className={cn("flex flex-col max-w-[75%] sm:max-w-[65%]", isOwn ? "items-end" : "items-start")}>
        <div className={cn("flex flex-col gap-1.5", isOwn ? "items-end" : "items-start")}>
          {message.attachments.length > 0 && (
            <div className={cn("flex flex-col gap-1.5", isOwn ? "items-end" : "items-start")}>
              {message.attachments.map((a) => (
                <AttachmentTile key={a.id} attachment={a} onOpenImage={setLightboxUrl} />
              ))}
            </div>
          )}

          {hasBody && (
            <div
              className={cn(
                "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words transition-all",
                isOwn
                  ? isFailed
                    ? "bg-[#CC3333]/10 text-[#CC3333] border border-[#CC3333]/30 rounded-br-sm"
                    : "bg-[#036638] text-white rounded-br-sm"
                  : "bg-[#F3F4F6] text-[#1A1B1E] rounded-bl-sm",
                isSending && "opacity-60",
              )}
            >
              {message.body}
            </div>
          )}
        </div>

        <div className={cn("flex items-center gap-1.5 mt-1 text-[10px] text-[#9CA3AF]", isOwn && "flex-row-reverse")}>
          {!isOwn && <span className="font-semibold">{message.sender.name}</span>}
          {isSending ? (
            <span className="flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Sending…
            </span>
          ) : isFailed ? (
            <span className="flex items-center gap-1 text-[#CC3333] font-semibold">
              <AlertTriangle className="w-2.5 h-2.5" />
              Not delivered
            </span>
          ) : (
            <span>{formatMessageTimestamp(message.createdAt)}</span>
          )}
        </div>
      </div>

      {lightboxUrl &&
        createPortal(<ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />, document.body)}
    </motion.div>
  )
}
