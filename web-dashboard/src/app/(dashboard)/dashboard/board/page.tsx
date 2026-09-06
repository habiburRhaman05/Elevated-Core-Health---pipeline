"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { KanbanBoard } from "@/components/features/kanban-board"
import { BoardHeaderBar } from "@/components/features/board-header-bar"
import { BoardViewToolbar, useBoardView } from "@/components/features/board-view-toolbar"
import { StatusBar } from "@/components/features/status-bar"
import { ImportDialog } from "@/components/features/import-dialog"
import { AddPatientDialog } from "@/components/features/add-patient-dialog"
import { usePatients, useRealtimePatients } from "@/hooks/query/usePatients"
import { EMPTY_BOARD_FILTERS, type BoardFilters } from "@/lib/board-filters"
import { LayoutGrid } from "lucide-react"

export default function VABoardPage() {
  const searchParams = useSearchParams()
  const claimPatientId = searchParams.get("claim")
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_BOARD_FILTERS)
  const [view, changeView] = useBoardView()
  // Live-refresh the board via Pusher when a backend sync (e.g. the Grow
  // Therapy calendar cron or a Klarity webhook) creates/updates patients — no
  // manual reload needed. See useRealtimePatients in usePatients.ts.
  useRealtimePatients()
  // Live total for the count chip — same cached query the board uses, so this
  // adds no extra network round-trip.
  const { data: patients } = usePatients()

  // Desktop (lg+): fixed header height, so the board locks to the viewport
  // with internal scrollbars. Phone/tablet: the mobile topbar is taller, so
  // the page flows naturally (scrolls) to avoid clipping the board.
  return (
    <div className="flex flex-col h-full overflow-x-hidden lg:h-[calc(100vh-7.5rem)] lg:overflow-hidden no-scrollbar">
      {/* - Merged Board Header + Filter Bar - */}
      <div className="mb-4">
        <BoardHeaderBar
          icon={LayoutGrid}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <AddPatientDialog />
              <ImportDialog />
              <StatusBar />
            </div>
          }
          filters={filters}
          onChange={setFilters}
        />
      </div>

      {/* - Count chip + List/Grid view toggle (right corner) - */}
      <BoardViewToolbar
        count={patients?.length ?? 0}
        view={view}
        onViewChange={changeView}
      />

      {/* - Kanban Board (grid) / compact list - */}
      <KanbanBoard
        initialPatientId={claimPatientId ?? undefined}
        filters={filters}
        view={view}
      />
    </div>
  )
}
