"use client"

import { useRef, useState, type DragEvent } from "react"
import { UploadCloud, X, File as FileIcon } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUpload: (files: File[]) => void
}

/**
 * The deliberate upload flow — opened only by the toolbar's Upload button
 * (the page-level dropzone in documents-manager.tsx handles the "just drag a
 * file onto the page" shortcut on its own, without this dialog). Accepts a
 * drop or a browse-click here, single or multiple files either way.
 */
export function UploadModal({ open, onClose, onUpload }: UploadModalProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [selected, setSelected] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setSelected([])
    setIsDraggingOver(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const addFiles = (files: File[]) => {
    if (files.length === 0) return
    setSelected((prev) => [...prev, ...files])
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingOver(false)
    addFiles(Array.from(e.dataTransfer.files ?? []))
  }

  const handleBrowseSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []))
    e.target.value = ""
  }

  const removeSelected = (idx: number) => setSelected((prev) => prev.filter((_, i) => i !== idx))

  const handleConfirmUpload = () => {
    if (selected.length === 0) return
    onUpload(selected)
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#1A1B1E]">Upload Files</DialogTitle>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleBrowseSelected}
        />

        {/* The dropzone itself has no click handler — dragging is the only way
            to act on it directly; browsing is the separate button below. */}
        <div
          onDragEnter={(e) => {
            e.preventDefault()
            if (e.dataTransfer.types.includes("Files")) setIsDraggingOver(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault()
            setIsDraggingOver(false)
          }}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            isDraggingOver ? "border-[#036638] bg-[#EBF7EC]" : "border-[#E5E7EB] bg-[#F9FAFB]",
          )}
        >
          <UploadCloud className={cn("w-8 h-8", isDraggingOver ? "text-[#036638]" : "text-[#9CA3AF]")} />
          <p className="text-sm font-semibold text-[#1A1B1E]">Drag &amp; drop files to upload</p>
          <p className="text-xs text-[#6B7280]">Single or multiple files supported</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="mt-1"
          >
            Browse files
          </Button>
        </div>

        {selected.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {selected.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]"
              >
                <FileIcon className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                <span className="text-xs text-[#374151] truncate flex-1">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeSelected(idx)}
                  className="p-0.5 rounded hover:bg-gray-200 text-[#9CA3AF] hover:text-[#374151] shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={selected.length === 0}
            onClick={handleConfirmUpload}
            className="bg-[#036638] hover:bg-[#025030] text-white disabled:opacity-40"
          >
            Upload {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
