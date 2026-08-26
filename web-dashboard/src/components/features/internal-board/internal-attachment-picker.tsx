"use client"

import { useRef, useState, type DragEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Film, Image as ImageIcon, Music, Paperclip, UploadCloud } from "lucide-react"
import { cn } from "@/lib/utils"

const ACCEPT =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv"

interface AttachmentPickerProps {
  /** No conversation selected yet — the whole composer is disabled, this
   *  button included. Genuinely inert (matches the textarea/send button). */
  disabled?: boolean
  /** Server has no Cloudinary credentials set — the button stays clickable
   *  (so it never LOOKS broken) but the popover explains why nothing here
   *  will actually upload yet, same convention as the SMS module's
   *  permanently-explained dummy AttachmentPicker. */
  notConfigured?: boolean
  /** Fired once per user action with every file they picked/dropped in that action. */
  onFilesSelected: (files: File[]) => void
}

/**
 * Real attach button + popover — click "Choose files" or drag files straight
 * onto the drop zone.
 */
export function InternalAttachmentPicker({ disabled, notConfigured, onFilesSelected }: AttachmentPickerProps) {
  const [open, setOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const closeAnd = (files: File[]) => {
    if (files.length > 0) onFilesSelected(files)
    setOpen(false)
    setDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (notConfigured) return
    closeAnd(Array.from(e.dataTransfer.files ?? []))
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Attach files"
        aria-label="Attach files"
        className={cn(
          "p-1.5 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors disabled:opacity-40 disabled:pointer-events-none",
          open && "text-[#036638] bg-[#036638]/8",
        )}
      >
        <Paperclip className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-outside catcher */}
            <button
              type="button"
              aria-label="Close attachment picker"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-0 mb-2 w-[260px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-bold text-[#374151]">Attach files</p>
              </div>

              <div className="p-3">
                {notConfigured ? (
                  <div className="flex flex-col items-center justify-center gap-1.5 py-5 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-center">
                    <UploadCloud className="w-6 h-6 text-[#D1D5DB]" strokeWidth={1.5} />
                    <p className="text-[11px] font-semibold text-[#9CA3AF]">Not set up yet</p>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 py-5 rounded-lg border-2 border-dashed text-center cursor-pointer transition-colors",
                      dragOver ? "border-[#036638] bg-[#EBF7EC]" : "border-gray-200 bg-gray-50 hover:bg-gray-100",
                    )}
                  >
                    <UploadCloud className={cn("w-6 h-6", dragOver ? "text-[#036638]" : "text-[#9CA3AF]")} strokeWidth={1.5} />
                    <p className="text-[11px] font-semibold text-[#6B7280]">
                      Drop files here or <span className="text-[#036638]">browse</span>
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-center gap-3 mt-2.5 text-[#9CA3AF]">
                  <span title="Images">
                    <ImageIcon className="w-3.5 h-3.5" />
                  </span>
                  <span title="Video">
                    <Film className="w-3.5 h-3.5" />
                  </span>
                  <span title="Audio">
                    <Music className="w-3.5 h-3.5" />
                  </span>
                  <span title="Files">
                    <Paperclip className="w-3.5 h-3.5" />
                  </span>
                </div>
                <p className="text-[10px] text-[#9CA3AF] text-center mt-1.5">
                  {notConfigured
                    ? "File attachments aren't configured on this server yet."
                    : "Images, video, audio & docs — up to 25MB each"}
                </p>
              </div>

              {!notConfigured && (
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => closeAnd(Array.from(e.target.files ?? []))}
                />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
