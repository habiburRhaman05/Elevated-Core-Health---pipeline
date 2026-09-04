"use client"

import { useState, type DragEvent, type ReactNode } from "react"
import { UploadCloud } from "lucide-react"

interface DocumentDropzoneProps {
  disabled?: boolean
  onFilesDropped: (files: File[]) => void
  children: ReactNode
}

/**
 * Wraps the whole documents page body so dropping a file anywhere on it — not
 * just onto a specific widget — uploads it straight away. Deliberately has no
 * onClick: clicking this area does nothing, since the Upload button is the
 * only way to open the deliberate browse/drag dialog (see upload-modal.tsx).
 * Counts drag enter/leave events (rather than a plain boolean) because child
 * elements re-fire these as the pointer crosses their borders, which
 * otherwise flickers the overlay.
 */
export function DocumentDropzone({ disabled, onFilesDropped, children }: DocumentDropzoneProps) {
  const [dragDepth, setDragDepth] = useState(0)
  const isDraggingOver = dragDepth > 0

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    if (e.dataTransfer.types.includes("Files")) setDragDepth((d) => d + 1)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    setDragDepth((d) => Math.max(0, d - 1))
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragDepth(0)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) onFilesDropped(files)
  }

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {isDraggingOver && !disabled && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-[#036638] bg-[#EBF7EC]/90 backdrop-blur-[1px] pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-[#036638]">
            <UploadCloud className="w-10 h-10" />
            <p className="text-sm font-bold">Drag &amp; drop to upload</p>
          </div>
        </div>
      )}
    </div>
  )
}
