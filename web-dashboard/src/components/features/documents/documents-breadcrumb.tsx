"use client"

import { ChevronRight, Home } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BreadcrumbEntry } from "./types"

interface DocumentsBreadcrumbProps {
  path: BreadcrumbEntry[]
  onNavigate: (path: BreadcrumbEntry[]) => void
}

export function DocumentsBreadcrumb({ path, onNavigate }: DocumentsBreadcrumbProps) {
  return (
    <div className="flex items-center gap-1.5 text-sm flex-wrap">
      <button
        onClick={() => onNavigate([])}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#EBF7EC] transition-colors",
          path.length === 0 ? "text-[#036638] font-semibold" : "text-[#6B7280]",
        )}
      >
        <Home className="w-3.5 h-3.5" />
        Documents
      </button>
      {path.map((entry, idx) => (
        <div key={entry.id} className="flex items-center gap-1.5">
          <ChevronRight className="w-3.5 h-3.5 text-[#D1D5DB]" />
          <button
            onClick={() => onNavigate(path.slice(0, idx + 1))}
            className={cn(
              "px-2 py-1 rounded-lg hover:bg-[#EBF7EC] transition-colors truncate max-w-[200px]",
              idx === path.length - 1 ? "text-[#036638] font-semibold" : "text-[#6B7280]",
            )}
          >
            {entry.name}
          </button>
        </div>
      ))}
    </div>
  )
}
