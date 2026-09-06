"use client"

import { useMemo, useRef, useState } from "react"
import {
  usePatients,
  useRealtimePatients,
  useMoveStage,
  useListVas,
  useChecklistItems,
} from "@/hooks/query/usePatients"
import { toast } from "sonner"
import { PatientCard } from "@/components/features/patient-card"
import { PatientModal } from "@/components/features/patient-modal"
import { ImportDialog } from "@/components/features/import-dialog"
import { StageSettingsDialog } from "@/components/features/stage-settings-dialog"
import { AddPatientDialog } from "@/components/features/add-patient-dialog"
import { StageFilterPopup } from "@/components/features/stage-filter-popup"
import { StageJumpBar } from "@/components/features/stage-jump-bar"
import { BoardHeaderBar } from "@/components/features/board-header-bar"
import { BoardViewToolbar, useBoardView } from "@/components/features/board-view-toolbar"
import { PatientListView } from "@/components/features/patient-list-view"
import { useStageMeta } from "@/hooks/query/useStages"
import { useStageJump } from "@/hooks/useStageJump"
import { EMPTY_BOARD_FILTERS, filterPatients, type BoardFilters } from "@/lib/board-filters"
import type { Patient, PatientStage } from "@/types"
import { AlertTriangle, CheckCircle2, Filter, Loader2, RefreshCw, SearchX, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

export default function AdminBoardPage() {
  // Live-refresh the board via Pusher when a backend sync (e.g. the Grow
  // Therapy calendar cron or a Klarity webhook) creates/updates patients — no
  // manual reload needed. See useRealtimePatients in usePatients.ts.
  useRealtimePatients()
  const { data: patients, isLoading, error, refetch } = usePatients()
  const { data: vas } = useListVas()
  const moveStage = useMoveStage()
  const { order: stageOrder, labels: stageLabels, hints: stageHints, byKey: stageByKey } = useStageMeta()
  const { data: checklistDefs } = useChecklistItems()
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  // Drag-and-drop stage moves (same behavior as the VA board) — the dragged
  // card id + the column currently being hovered, for the drop highlight.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_BOARD_FILTERS)
  const [stageFilters, setStageFilters] = useState<Record<string, Patient[]>>({})
  // Stages whose filter matched 0 — the column keeps its cards and the error
  // is shown only in the stage header.
  const [filterNotFound, setFilterNotFound] = useState<Record<string, boolean>>({})
  const [openStageFilterPopup, setOpenStageFilterPopup] = useState<string | null>(null)
  const { activeStage: quickJumpStage, lastJumpedStage, jump: handleQuickJump, registerStageRef } = useStageJump()
  const [view, changeView] = useBoardView()
  // In-flight stage moves — list view shows a spinner on the row being moved.
  const pendingMoves = useRef<Set<string>>(new Set())
  // Stages currently receiving a move — the stage header shows a spinner
  // while the request is in flight (drag-and-drop or move buttons).
  const [movingStages, setMovingStages] = useState<Set<string>>(new Set())

  // Global filters from the board filter bar — applied across every stage column
  const filteredPatients = useMemo(() => {
    if (!patients) return []
    return filterPatients(patients, filters)
  }, [patients, filters])

  const groupedPatients = useMemo(() => {
    let result = filteredPatients.reduce(
      (acc, p) => {
        if (!acc[p.stage]) acc[p.stage] = []
        acc[p.stage].push(p)
        return acc
      },
      {} as Record<string, Patient[]>,
    )

    // Apply per-stage filters if they exist. A filter that matched nothing
    // is skipped — the stage keeps its cards and the error shows in the
    // header instead.
    if (Object.keys(stageFilters).length > 0) {
      Object.keys(result).forEach(stage => {
        if (stageFilters[stage] && !filterNotFound[stage]) {
          result[stage] = stageFilters[stage]
        }
      })
    }

    return result || {}
  }, [filteredPatients, stageFilters, filterNotFound])

  const handleMoveStage = (id: string, target: PatientStage) => {
    if (pendingMoves.current.has(id)) return
    pendingMoves.current.add(id)
    setMovingStages((prev) => new Set(prev).add(target))
    // Returns the promise so callers (card Move/Back buttons) can show a
    // spinner until the move settles. Errors are toasted by the hook.
    return moveStage.mutateAsync({ id, targetStage: target }).finally(() => {
      pendingMoves.current.delete(id)
      setMovingStages((prev) => {
        const next = new Set(prev)
        next.delete(target)
        return next
      })
    })
  }

  // ---------------------------------------------------------------------
  // Drag-and-drop — mirrors the VA board (KanbanBoard) so admins get the
  // exact same behavior: pick a card up, drop it on another stage column.
  // Forward moves are gated by the same client-side checklist check; the
  // backend re-validates on every move regardless.
  // ---------------------------------------------------------------------
  const handleDragStart = (e: React.DragEvent, patientId: string) => {
    setDraggingId(patientId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", patientId)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropTarget(stage)
  }

  const handleDragLeave = (e: React.DragEvent, stage: string) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTarget((prev) => (prev === stage ? null : prev))
    }
  }

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault()
    const patientId = e.dataTransfer.getData("text/plain")
    if (!patientId) return

    setDropTarget(null)
    setDraggingId(null)

    if (pendingMoves.current.has(patientId)) return

    const patient = patients?.find((p) => p.id === patientId)
    if (!patient) return

    const curIdx = stageOrder.indexOf(patient.stage)
    const tgtIdx = stageOrder.indexOf(targetStage)
    if (curIdx === tgtIdx) return

    // One stage at a time forward; backward moves are always allowed.
    if (tgtIdx > curIdx + 1) {
      toast.error("Cannot skip stages. Move forward one stage at a time.")
      return
    }

    // Forward moves require every REQUIRED checklist item of the current
    // stage to be complete (matches the server-side gate).
    if (tgtIdx > curIdx) {
      const stageState = patient.checklistState?.[patient.stage] ?? {}
      const requiredDefs = (checklistDefs ?? []).filter(
        (item) => item.stage === patient.stage && item.status === "required",
      )
      const allComplete = requiredDefs.every((item) => stageState[item.id] === true)
      if (!allComplete) {
        toast.error("Please complete all required checklist items before moving to the next stage.")
        return
      }
    }

    handleMoveStage(patientId, targetStage as PatientStage)
  }

  // Live patient count per stage — feeds the jump-bar pills.
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const stage of stageOrder) {
      counts[stage] = groupedPatients[stage]?.length ?? 0
    }
    return counts
  }, [groupedPatients, stageOrder])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-[#036638] animate-spin" />
      </div>
    )
  }

  // Only replace the whole page with an error state when we have nothing to
  // fall back on. A background refetch (e.g. right after Add Patient or a
  // bulk import invalidates the cache) can transiently fail without losing
  // the data we already have — in that case keep the board rendered with its
  // last-known-good patients instead of wiping every stage to a blank error
  // screen (this mirrors the same fix already applied to the shared
  // KanbanBoard used by the VA board).
  if (error && !patients) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[#1A1B1E]">Unable to load the board</p>
          <p className="text-xs text-[#6B7280] mt-1">
            {(error as any)?.response?.data?.message || "Connection issue - please try again"}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#036638] text-white text-sm font-semibold hover:bg-[#025030] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    )
  }

  // Desktop (lg+): fixed header height, so the board locks to the viewport
  // with internal scrollbars. Phone/tablet: the mobile topbar is taller, so
  // the page flows naturally (scrolls) to avoid clipping the board.
  return (
    <div className="flex flex-col h-full overflow-x-hidden lg:h-[calc(100vh-7.5rem)] lg:overflow-hidden no-scrollbar">
      {/* Stale-data banner — a background refetch failed but we're still showing the last good board */}
      {error && patients && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs font-medium text-amber-800">
          Couldn&apos;t refresh the board just now - showing the last loaded data. It&apos;ll retry automatically.
        </div>
      )}

      {/* - Merged Board Header + Filter Bar - */}
      <div className="mb-4">
        <BoardHeaderBar
          icon={ShieldCheck}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <AddPatientDialog />
              <ImportDialog />
              <StageSettingsDialog />
            </div>
          }
          filters={filters}
          onChange={setFilters}
          vas={vas}
        />
      </div>

      {/* - Count chip + List/Grid view toggle (right corner) - */}
      <BoardViewToolbar
        count={patients?.length ?? 0}
        view={view}
        onViewChange={changeView}
      />

      {/* - Jump-to-stage bar - */}
      <StageJumpBar
        stageOrder={stageOrder}
        stageLabels={stageLabels}
        counts={stageCounts}
        activeStage={quickJumpStage}
        selectedStage={lastJumpedStage}
        onJump={handleQuickJump}
      />

      {/* - Grid view: kanban columns (stacks vertically on phone).
          List view: one compact vertical list of all stages. */}
      {view === "grid" ? (
      <div className="flex-1 min-h-0 overflow-x-hidden sm:overflow-x-auto sm:snap-x sm:snap-mandatory scrollbar-brand">
        <div className="flex flex-col sm:flex-row h-auto lg:h-full gap-3 sm:gap-4 p-0 sm:p-6 sm:pl-0 w-full sm:min-w-max">
          {stageOrder.map((stage) => {
            const stagePatients = groupedPatients[stage] || []
            // Per-stage filter state — active means the popup's Apply was
            // pressed. A 0-match filter keeps the stage's cards and shows the
            // error only in the header.
            const stageFilterActive = Object.prototype.hasOwnProperty.call(stageFilters, stage)
            const filterHasNoResults = stageFilterActive && filterNotFound[stage] === true
            const matchedCount = stageFilterActive && !filterHasNoResults ? stagePatients.length : null
            const isOver = dropTarget === stage
            const isDragDisabled = stageByKey.get(stage)?.isFinal ?? false
            return (
              <div
                key={stage}
                ref={registerStageRef(stage)}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={(e) => handleDragLeave(e, stage)}
                onDrop={(e) => handleDrop(e, stage)}
                className={cn(
                  "w-full min-w-0 sm:w-[420px] sm:shrink-0 sm:snap-center flex flex-col bg-[#EBF7EC]/40 rounded-xl border border-[#E5E7EB]/50 transition-all duration-200 scroll-mt-14 lg:scroll-mt-0",
                  quickJumpStage === stage && "animate-jump-flash",
                  isOver && !isDragDisabled
                    ? "border-[#65BD6C] bg-[#EBF7EC] shadow-lg shadow-[#65BD6C]/10 sm:scale-[1.02]"
                    : "border-[#E5E7EB]/50 bg-[#EBF7EC]/40",
                )}
              >
                <div className="px-3.5 py-3 border-b border-[#E5E7EB]/50 relative">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-[#036638] truncate">
                        {stageLabels[stage]}
                      </h3>
                      <p className="text-[10px] text-[#6B7280] mt-0.5">
                        {stageHints[stage]}
                      </p>
                      {filterHasNoResults ? (
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-red-50 text-[10px] font-bold text-red-500">
                          <SearchX className="w-3 h-3" />
                          Search result 0
                        </span>
                      ) : stageFilterActive && (matchedCount ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-[#EBF7EC] text-[10px] font-bold text-[#036638]">
                          <CheckCircle2 className="w-3 h-3" />
                          {matchedCount} item{matchedCount === 1 ? "" : "s"} found
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setOpenStageFilterPopup(openStageFilterPopup === stage ? null : stage)}
                        className={cn(
                          "p-1.5 rounded-lg transition-all cursor-pointer",
                          openStageFilterPopup === stage
                            ? "bg-[#036638]/15 text-[#036638]"
                            : "text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6B7280]"
                        )}
                        title="Filter and sort"
                      >
                        <Filter className="w-4 h-4" />
                      </button>
                      {movingStages.has(stage) ? (
                        <Loader2 className="w-4 h-4 text-[#036638] animate-spin" />
                      ) : (
                        <span className="text-xs font-bold text-[#6B7280] bg-white rounded-full w-5 h-5 flex items-center justify-center border border-[#E5E7EB]">
                          {stagePatients.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stage Filter Popup */}
                  <StageFilterPopup
                    stage={stageLabels[stage]}
                    patients={filteredPatients.filter(p => p.stage === stage)}
                    onFilterChange={(filtered) => {
                      setStageFilters(prev => ({
                        ...prev,
                        [stage]: filtered
                      }))
                      setFilterNotFound(prev => ({
                        ...prev,
                        [stage]: filtered.length === 0
                      }))
                    }}
                    isOpen={openStageFilterPopup === stage}
                    onOpenChange={(open) => {
                      if (!open) setOpenStageFilterPopup(null)
                    }}
                  />
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-brand p-3 space-y-2.5">
                  {stagePatients.length > 0 ? (
                    stagePatients.map((patient) => (
                      <PatientCard
                        key={patient.id}
                        patient={patient}
                        onMoveStage={handleMoveStage}
                        onClick={(p) => setSelectedPatientId(p.id)}
                        isDragging={draggingId === patient.id}
                        onDragStart={(e) => handleDragStart(e, patient.id)}
                        onDragEnd={handleDragEnd}
                      />
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-xs text-[#6B7280] italic">No patients</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      ) : (
        // List view needs its own scroll container on desktop: the page root
        // is a fixed-height overflow-hidden flex column, so without a
        // flex-1/min-h-0/overflow-y-auto wrapper the list content gets
        // clipped and the page can't scroll. On phone/tablet the page flows
        // naturally, so the scroll behavior is desktop-only.
        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto scrollbar-brand">
          <PatientListView
            patients={filteredPatients}
            stageOrder={stageOrder}
            stageLabels={stageLabels}
            onMoveStage={handleMoveStage}
            onSelect={(p) => setSelectedPatientId(p.id)}
            pendingIds={pendingMoves.current}
            registerStageRef={registerStageRef}
            activeStage={quickJumpStage}
          />
        </div>
      )}

      <PatientModal
        patientId={selectedPatientId}
        open={!!selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
      />
    </div>
  )
}
