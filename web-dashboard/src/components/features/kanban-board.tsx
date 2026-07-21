"use client"

import { useState, useCallback, useRef } from "react"
import { usePatients, useMoveStage } from "@/hooks/query/usePatients"
import { PatientCard } from "@/components/features/patient-card"
import { PatientModal } from "@/components/features/patient-modal"
import { STAGE_ORDER, STAGE_LABELS, STAGE_HINTS } from "@/types"
import type { Patient, PatientStage } from "@/types"
import { Loader2, GripVertical } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/auth/useAuth"

export function KanbanBoard({ initialPatientId }: { initialPatientId?: string }) {
  const { data: patients, isLoading, error } = usePatients()
  const moveStage = useMoveStage()
  const { user: currentUser } = useAuth()
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId ?? null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const pendingMoves = useRef<Set<string>>(new Set())

  const groupedPatients =
    patients?.reduce(
      (acc, p) => {
        if (!acc[p.stage]) acc[p.stage] = []
        acc[p.stage].push(p)
        return acc
      },
      {} as Record<string, Patient[]>,
    ) || {}

  // — Assignment gating check —
  const canUserMovePatient = useCallback(
    (patient: Patient): boolean => {
      if (!currentUser) return false
      if (currentUser.role === "admin") return true
      return !!patient.assignedTo && patient.assignedTo === currentUser.id
    },
    [currentUser],
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent, patientId: string) => {
      const patient = patients?.find((p) => p.id === patientId)
      if (!patient || !canUserMovePatient(patient)) {
        e.preventDefault()
        toast.error("You can only move patients assigned to you")
        return
      }
      setDraggingId(patientId)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", patientId)
    },
    [patients, canUserMovePatient],
  )

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDropTarget(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, stage: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropTarget(stage)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent, stage: string) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTarget((prev) => (prev === stage ? null : prev))
    }
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStage: string) => {
      e.preventDefault()
      const patientId = e.dataTransfer.getData("text/plain")
      if (!patientId) return

      setDropTarget(null)
      setDraggingId(null)

      if (pendingMoves.current.has(patientId)) return

      const patient = patients?.find((p) => p.id === patientId)
      if (!patient) return

      // — Assignment gate on drop too —
      if (!canUserMovePatient(patient)) {
        toast.error("You can only move patients assigned to you")
        return
      }

      const curIdx = STAGE_ORDER.indexOf(patient.stage)
      const tgtIdx = STAGE_ORDER.indexOf(targetStage as PatientStage)
      if (curIdx === tgtIdx) return

      if (tgtIdx > curIdx + 1) {
        toast.error("Cannot skip stages. Move forward one stage at a time.")
        return
      }

      if (tgtIdx > curIdx) {
        const stageState = patient.checklistState?.[patient.stage] ?? {}
        const defs = await fetchChecklistDefs(patient.stage)
        if (defs.length > 0) {
          const allComplete = defs.every((item: any) => stageState[item.id] === true)
          if (!allComplete) {
            toast.error("Please complete all checklist items before moving to the next stage.")
            return
          }
        }
      }

      pendingMoves.current.add(patientId)
      try {
        await moveStage.mutateAsync({ id: patientId, targetStage: targetStage as PatientStage })
      } finally {
        pendingMoves.current.delete(patientId)
      }
    },
    [patients, moveStage, canUserMovePatient],
  )

  const handleMoveStage = useCallback(
    (id: string, target: PatientStage) => {
      if (pendingMoves.current.has(id)) return
      pendingMoves.current.add(id)
      moveStage.mutate(
        { id, targetStage: target },
        { onSettled: () => pendingMoves.current.delete(id) },
      )
    },
    [moveStage],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-[#E8792E] animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-500">Failed to load patients</p>
      </div>
    )
  }

  return (
    <>
      <div className="h-[calc(100vh-12rem)] -mx-6 -mb-6 overflow-x-auto">
        <div className="inline-flex h-full gap-3 p-6 min-w-max">
          {STAGE_ORDER.map((stage) => {
            const stagePatients = groupedPatients[stage] || []
            const isOver = dropTarget === stage
            const isDisabled = stage === "reconciled"
            return (
              <div
                key={stage}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={(e) => handleDragLeave(e, stage)}
                onDrop={(e) => handleDrop(e, stage)}
                className={cn(
                  "w-72 flex flex-col rounded-xl border shrink-0 transition-all duration-200",
                  isOver && !isDisabled
                    ? "border-[#F2994A] bg-[#FFF0E5] shadow-lg shadow-[#F2994A]/10 scale-[1.02]"
                    : "border-[#E5E7EB]/50 bg-[#FFF0E5]/40",
                )}
              >
                <div className="px-3.5 py-3 border-b border-[#E5E7EB]/50">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-[#E8792E] truncate">
                        {STAGE_LABELS[stage]}
                      </h3>
                      <p className="text-[10px] text-[#6B7280] mt-0.5">
                        {STAGE_HINTS[stage]}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-[#6B7280] bg-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 border border-[#E5E7EB]">
                      {stagePatients.length}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {stagePatients.length > 0 ? (
                    stagePatients.map((patient) => {
                      const isPending = pendingMoves.current.has(patient.id)
                      const isDragging = draggingId === patient.id
                      return (
                        <div key={patient.id} className="relative group">
                          {isPending && (
                            <div className="absolute inset-0 z-10 bg-white/70 rounded-lg flex items-center justify-center">
                              <Loader2 className="w-5 h-5 text-[#E8792E] animate-spin" />
                            </div>
                          )}
                          <PatientCard
                            patient={patient}
                            onMoveStage={handleMoveStage}
                            onClick={(p) => setSelectedPatientId(p.id)}
                            isDragging={isDragging}
                            onDragStart={(e) => handleDragStart(e, patient.id)}
                            onDragEnd={handleDragEnd}
                          />
                        </div>
                      )
                    })
                  ) : (
                    <div
                      className={cn(
                        "text-center py-8 rounded-lg border-2 border-dashed transition-colors",
                        isOver && !isDisabled
                          ? "border-[#F2994A] bg-[#FFF0E5]"
                          : "border-transparent",
                      )}
                    >
                      {isOver && !isDisabled ? (
                        <p className="text-xs text-[#E8792E] font-medium flex items-center justify-center gap-1.5">
                          <GripVertical className="w-3.5 h-3.5" />
                          Drop here
                        </p>
                      ) : (
                        <p className="text-xs text-[#6B7280] italic">No patients</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <PatientModal
        patientId={selectedPatientId}
        open={!!selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
      />
    </>
  )
}

let cachedDefs: Record<string, any[]> | null = null

async function fetchChecklistDefs(stage: string) {
  if (cachedDefs) {
    const stageDefs = cachedDefs[stage]
    if (stageDefs) return stageDefs
  }
  try {
    const { PatientsService } = await import("@/services/patients.service")
    const all = await PatientsService.getChecklistItems()
    const grouped: Record<string, any[]> = {}
    for (const item of all) {
      if (!grouped[item.stage]) grouped[item.stage] = []
      grouped[item.stage].push(item)
    }
    cachedDefs = grouped
    return grouped[stage] || []
  } catch {
    return []
  }
}
