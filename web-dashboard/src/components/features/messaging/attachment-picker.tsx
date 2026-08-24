"use client"

import { useEffect, useRef, useState } from "react"
import { Paperclip, UploadCloud, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface AttachmentPickerProps {
  disabled?: boolean
}

/**
 * Attach button + popover. Deliberately dummy - Quo's API has no MMS support
 * (see CLAUDE.md / requirements doc "Out of Scope"), so there is nothing
 * real to wire here yet. Shows an actual popup (matching EmojiPicker's
 * pattern) rather than just a toast, so it reads as an intentional,
 * explained placeholder instead of a button that silently does nothing.
 * The drop zone and "Choose files" control are visually disabled - clicking
 * anywhere inside never opens a file dialog or starts an upload.
 */
export function AttachmentPicker({ disabled }: AttachmentPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Attachments"
        aria-label="Attach a file"
        className={cn(
          "p-1.5 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors disabled:opacity-40 disabled:pointer-events-none",
          open && "text-[#036638] bg-[#036638]/8",
        )}
      >
        <Paperclip className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[280px] bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-bold text-[#374151]">Attachments</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 space-y-2.5">
            {/* Visually disabled drop zone - not a real control, nothing here opens a picker or uploads anything. */}
            <div
              aria-disabled
              className="flex flex-col items-center justify-center gap-1.5 py-5 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-center cursor-not-allowed select-none"
            >
              <UploadCloud className="w-6 h-6 text-[#D1D5DB]" strokeWidth={1.5} />
              <p className="text-[11px] font-semibold text-[#9CA3AF]">Drop files here</p>
            </div>

            <button
              type="button"
              disabled
              className="w-full px-3 py-1.5 rounded-lg bg-gray-100 text-[#9CA3AF] text-xs font-semibold cursor-not-allowed"
            >
              Choose files
            </button>

            <p className="text-[10px] text-[#9CA3AF] leading-relaxed">
              File attachments aren&apos;t available yet - Quo&apos;s SMS API doesn&apos;t support sending image/media
              messages (MMS) at this time.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
