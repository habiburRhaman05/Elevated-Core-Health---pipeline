"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DeleteConfirmModalProps {
  open: boolean
  title: string
  description: string
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteConfirmModal({ open, title, description, isDeleting, onCancel, onConfirm }: DeleteConfirmModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-bold text-[#1A1B1E] mb-2">{title}</h3>
        <p className="text-xs text-[#6B7280] mb-4">{description}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={isDeleting}
            onClick={onConfirm}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  )
}
