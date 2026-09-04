"use client"

import { CheckCircle2, Loader2, X, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UploadQueueItem } from "./types"

interface UploadQueueProps {
  items: UploadQueueItem[]
  onDismiss: () => void
}

/** Floating panel tracking one or more concurrent uploads (drag-drop can hand it many files at once). */
export function UploadQueue({ items, onDismiss }: UploadQueueProps) {
  if (items.length === 0) return null

  const allSettled = items.every((i) => i.status !== "uploading")

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-[#E5E7EB] shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#F3F4F6]">
        <p className="text-xs font-bold text-[#1A1B1E]">
          {allSettled ? "Upload complete" : `Uploading ${items.filter((i) => i.status === "uploading").length} of ${items.length}...`}
        </p>
        {allSettled && (
          <button onClick={onDismiss} className="p-1 rounded-lg hover:bg-gray-100 text-[#6B7280]">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-[#F3F4F6]">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
            {item.status === "uploading" && <Loader2 className="w-4 h-4 text-[#036638] animate-spin shrink-0" />}
            {item.status === "done" && <CheckCircle2 className="w-4 h-4 text-[#036638] shrink-0" />}
            {item.status === "error" && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className={cn("text-xs font-medium truncate", item.status === "error" ? "text-red-600" : "text-[#374151]")}>
                {item.fileName}
              </p>
              {item.error && <p className="text-[10px] text-red-500 truncate">{item.error}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
