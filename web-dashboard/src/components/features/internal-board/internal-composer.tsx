"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, File as FileIcon, Loader2, Send, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { InternalMessagingService } from "@/services/internal-messaging.service"
import type { PendingInternalAttachment } from "@/types"
import { InternalAttachmentPicker } from "./internal-attachment-picker"

interface PendingUpload {
  id: string
  file: File
  progress: number
  status: "uploading" | "done" | "error"
  result?: PendingInternalAttachment
  error?: string
}

function PendingUploadThumb({ upload, onRemove }: { upload: PendingUpload; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!upload.file.type.startsWith("image/")) return
    const url = URL.createObjectURL(upload.file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a given upload's File instance never changes across re-renders
  }, [upload.file])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shrink-0 group"
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- transient local object URL preview, revoked implicitly on unmount
        <img src={previewUrl} alt={upload.file.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 px-1">
          <FileIcon className="w-4 h-4 text-[#9CA3AF]" />
          <span className="text-[8px] text-[#9CA3AF] truncate w-full text-center">{upload.file.name}</span>
        </div>
      )}

      {upload.status === "uploading" && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <svg className="w-6 h-6 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeDasharray={`${(upload.progress / 100) * 97.4} 97.4`}
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}

      {upload.status === "error" && (
        <div className="absolute inset-0 bg-[#CC3333]/80 flex items-center justify-center" title={upload.error}>
          <AlertTriangle className="w-5 h-5 text-white" />
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attachment"
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1A1B1E] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </motion.div>
  )
}

interface InternalComposerProps {
  disabled?: boolean
  disabledReason?: string
  attachmentsEnabled: boolean
  onSend: (body: string | undefined, attachments: PendingInternalAttachment[] | undefined) => void
}

export function InternalComposer({ disabled, disabledReason, attachmentsEnabled, onSend }: InternalComposerProps) {
  const [draft, setDraft] = useState("")
  const [uploads, setUploads] = useState<PendingUpload[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isUploading = uploads.some((u) => u.status === "uploading")
  const hasFailedUpload = uploads.some((u) => u.status === "error")
  const canSend = !disabled && !isUploading && (draft.trim().length > 0 || uploads.some((u) => u.status === "done"))

  const startUpload = (file: File) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setUploads((prev) => [...prev, { id, file, progress: 0, status: "uploading" }])

    InternalMessagingService.uploadAttachment(file, (percent) => {
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress: percent } : u)))
    })
      .then((result) => {
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "done", progress: 100, result } : u)))
      })
      .catch((err) => {
        const message = err?.response?.data?.message || err?.message || "Upload failed"
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "error", error: message } : u)))
        toast.error(`${file.name}: ${message}`)
      })
  }

  const handleFilesSelected = (files: File[]) => {
    if (!attachmentsEnabled) {
      toast.info("File attachments aren't configured on this server yet.")
      return
    }
    for (const file of files) startUpload(file)
  }

  const removeUpload = (id: string) => setUploads((prev) => prev.filter((u) => u.id !== id))

  const handleSend = () => {
    if (!canSend) return
    const body = draft.trim() || undefined
    const attachments = uploads.filter((u) => u.status === "done" && u.result).map((u) => u.result as PendingInternalAttachment)
    onSend(body, attachments.length > 0 ? attachments : undefined)
    setDraft("")
    setUploads([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-gray-100 shrink-0 bg-white p-3">
      <div
        className={cn(
          "rounded-2xl border border-gray-200 bg-white transition-colors",
          "focus-within:border-[#65BD6C] focus-within:ring-2 focus-within:ring-[#65BD6C]/25",
          disabled && "bg-gray-50",
        )}
      >
        {disabledReason && (
          <div className="flex items-center gap-1.5 mx-2 mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {disabledReason}
          </div>
        )}

        <AnimatePresence>
          {uploads.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 mx-2 mt-2 overflow-x-auto pb-1"
            >
              {uploads.map((u) => (
                <PendingUploadThumb key={u.id} upload={u} onRemove={() => removeUpload(u.id)} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Select a conversation to start chatting" : "Write a message..."}
          disabled={disabled}
          rows={1}
          className="min-h-[40px] max-h-32 resize-none text-sm px-3.5 pt-2.5 pb-1 border-0 shadow-none bg-transparent focus:ring-0 focus:border-0 disabled:bg-transparent"
        />

        <div className="flex items-center justify-between gap-1 px-1.5 pb-1.5">
          <div className="flex items-center gap-0.5">
            <InternalAttachmentPicker disabled={disabled || !attachmentsEnabled} onFilesSelected={handleFilesSelected} />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={!canSend}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shrink-0 h-8 w-8 p-0 rounded-full"
            title={hasFailedUpload ? "Remove the failed attachment to send" : "Send"}
          >
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
