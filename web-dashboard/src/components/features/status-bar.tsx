"use client"

import { AlertTriangle, Flag, CheckCircle2 } from "lucide-react"
import { useDashboard } from "@/hooks/query/useDashboard"
import { cn } from "@/lib/utils"

export function StatusBar() {
  const { data: summary, isLoading, error } = useDashboard()

  if (isLoading) {
    return (
      <div className="h-9 bg-[#FFF0E5] border-b border-[#F2994A]/20 flex items-center px-6 gap-3">
        <div className="h-2 w-20 bg-[#F2994A]/20 rounded animate-pulse" />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="h-9 bg-[#FEF2F2] border-b border-red-200 flex items-center px-6">
        <AlertTriangle className="w-3.5 h-3.5 text-red-500 mr-2" />
        <span className="text-[11px] text-red-600 font-medium">
          Could not load status
        </span>
      </div>
    )
  }

  const hasIssues = summary.staleCount > 0 || summary.flaggedCount > 0

  return (
    <div
      className={cn(
        "h-9 border-b flex items-center px-6 gap-4 text-[11px] font-medium",
        hasIssues
          ? "bg-[#FEFCE8] border-[#FBE7B2]"
          : "bg-[#FFF0E5] border-[#F2994A]/20",
      )}
    >
      {hasIssues ? (
        <>
          {summary.staleCount > 0 && (
            <span className="flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              {summary.staleCount} stale card{summary.staleCount !== 1 ? "s" : ""}
            </span>
          )}
          {summary.flaggedCount > 0 && (
            <span className="flex items-center gap-1.5 text-amber-700">
              <Flag className="w-3.5 h-3.5 text-amber-500" />
              {summary.flaggedCount} flagged card{summary.flaggedCount !== 1 ? "s" : ""}
            </span>
          )}
        </>
      ) : (
        <span className="flex items-center gap-1.5 text-[#E8792E]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          All caught up
        </span>
      )}
    </div>
  )
}
