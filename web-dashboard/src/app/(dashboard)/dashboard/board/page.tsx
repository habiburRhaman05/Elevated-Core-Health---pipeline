"use client"

import { useSearchParams } from "next/navigation"
import { KanbanBoard } from "@/components/features/kanban-board"
import { StatusBar } from "@/components/features/status-bar"
import { LayoutGrid } from "lucide-react"

export default function VABoardPage() {
  const searchParams = useSearchParams()
  const claimPatientId = searchParams.get("claim")

  return (
    <div className="flex flex-col h-full">
      {/* — Board Header — */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#E8792E]/10 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-[#E8792E]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#1A1B1E]">Patient Pipeline Board</h1>
            <p className="text-xs text-[#6B7280]">Track patients through 7 workflow stages</p>
          </div>
        </div>
        <StatusBar />
      </div>

      {/* — Kanban Board — */}
      <KanbanBoard initialPatientId={claimPatientId ?? undefined} />
    </div>
  )
}
