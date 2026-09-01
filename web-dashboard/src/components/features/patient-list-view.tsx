"use client"

import { useMemo } from "react"
import { Calendar, CheckCircle2, ChevronRight, Flag, Loader2, Lock, Users } from "lucide-react"
import { useChecklistItems } from "@/hooks/query/usePatients"
import type { Patient, PatientStage } from "@/types"
import { cn } from "@/lib/utils"
import { getStageColor } from "@/lib/stage-colors"
import { formatClinicDate } from "@/lib/clinic-time"

interface PatientListViewProps {
  /** Already-filtered patients, shown across all stages in the list. */
  patients: Patient[]
  stageOrder: string[]
  stageLabels: Record<string, string>
  onMoveStage: (id: string, target: PatientStage) => void | Promise<unknown>
  onSelect: (patient: Patient) => void
  /** Set of patient ids currently being moved — rows show a spinner instead of the Next button. */
  pendingIds?: Set<string>
  /** Stage jump refs — attached to each stage's section header so the jump bar can scroll the list. */
  registerStageRef?: (stage: string) => (el: HTMLDivElement | null) => void
  /** Stage being jumped to — the matching section flashes brand-green briefly. */
  activeStage?: string | null
}

/**
 * Compact list view for the board (default on phones < 500px). Every stage
 * appears as its own section (stage name + count header, then that stage's
 * patients), ordered by the pipeline. Each row is deliberately minimal: name,
 * stage badge, appointment date and a one-tap "Next" button to advance the
 * stage. Clicking a row opens the full patient modal.
 */
export function PatientListView({
  patients,
  stageOrder,
  stageLabels,
  onMoveStage,
  onSelect,
  pendingIds,
  registerStageRef,
  activeStage,
}: PatientListViewProps) {
  // Required checklist defs per stage — used to gate the "Next" button: it
  // stays enabled only when every required item for the patient's current
  // stage is checked (mirrors the server-side canAdvance rule).
  const { data: checklistItems } = useChecklistItems()

  // All stages in pipeline order (empty ones included, like the grid columns),
  // each with its patients sorted by appointment date then name.
  const sections = useMemo(() => {
    const byStage: Record<string, Patient[]> = {}
    for (const p of patients) {
      if (!byStage[p.stage]) byStage[p.stage] = []
      byStage[p.stage].push(p)
    }
    const byDate = (a: Patient, b: Patient) => {
      const ta = a.appointmentDatetime ? new Date(a.appointmentDatetime).getTime() : Number.POSITIVE_INFINITY
      const tb = b.appointmentDatetime ? new Date(b.appointmentDatetime).getTime() : Number.POSITIVE_INFINITY
      if (ta !== tb) return ta - tb
      return (a.firstName || a.name || "").localeCompare(b.firstName || b.name || "")
    }
    for (const stage of Object.keys(byStage)) byStage[stage].sort(byDate)
    return stageOrder.map((stage) => ({ stage, patients: byStage[stage] ?? [] }))
  }, [patients, stageOrder])

  if (patients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white rounded-2xl border border-[#E5E7EB]">
        <div className="w-12 h-12 rounded-full bg-[#F3F4F6] flex items-center justify-center">
          <Users className="w-5 h-5 text-[#9CA3AF]" />
        </div>
        <p className="text-sm font-semibold text-[#1A1B1E]">No patients found</p>
        <p className="text-xs text-[#6B7280]">Try adjusting the filters</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-2">
      {sections.map(({ stage, patients: stagePatients }) => {
        const color = getStageColor(stage)
        const sectionRef = registerStageRef ? registerStageRef(stage) : undefined
        return (
          // Brief self-fading flash on the jumped-to section (same
          // animate-jump-flash the grid columns use — clears on its own).
          <section key={stage} className={cn("space-y-2", activeStage === stage && "animate-jump-flash")}>
            {/* Stage section header — the jump bar scrolls to this.
                scroll-mt-14 clears the fixed mobile topbar so the section
                lands at the top of the visible area on phones; desktop has no
                fixed overlap so it scrolls to the very top of the list. */}
            <div ref={sectionRef} className="flex items-center gap-2 px-1 scroll-mt-14 lg:scroll-mt-0">
              <span className={cn("w-2 h-2 rounded-full shrink-0", color.circle)} />
              <h4 className="text-xs font-bold text-[#036638] truncate">{stageLabels[stage] || stage}</h4>
              <span className="ml-auto text-[10px] font-bold text-[#6B7280] bg-white rounded-full px-1.5 py-0.5 border border-[#E5E7EB] shrink-0">
                {stagePatients.length}
              </span>
            </div>

            {stagePatients.length > 0 ? (
              <div className="space-y-2">
                {stagePatients.map((patient) => (
                  <PatientListRow
                    key={patient.id}
                    patient={patient}
                    stageOrder={stageOrder}
                    stageLabels={stageLabels}
                    checklistItems={checklistItems}
                    isPending={pendingIds?.has(patient.id) ?? false}
                    onMoveStage={onMoveStage}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[#9CA3AF] italic px-1">No patients in this stage</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

function PatientListRow({
  patient,
  stageOrder,
  stageLabels,
  checklistItems,
  isPending,
  onMoveStage,
  onSelect,
}: {
  patient: Patient
  stageOrder: string[]
  stageLabels: Record<string, string>
  checklistItems?: Array<{ id: string; stage: string; status: string }>
  isPending: boolean
  onMoveStage: (id: string, target: PatientStage) => void | Promise<unknown>
  onSelect: (patient: Patient) => void
}) {
  const idx = stageOrder.indexOf(patient.stage)
  const nextStage = idx >= 0 && idx < stageOrder.length - 1 ? stageOrder[idx + 1] : null
  // All REQUIRED items for the current stage must be checked to advance.
  const requiredDefs =
    checklistItems?.filter(
      (item) => item.stage === patient.stage && item.status === "required",
    ) ?? []
  const stageState = patient.checklistState?.[patient.stage] ?? {}
  const checklistComplete = requiredDefs.every((item) => stageState[item.id] === true)
  const color = getStageColor(patient.stage)
  const displayName = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || patient.name

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(patient)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(patient)
        }
      }}
      className="group w-full text-left bg-white rounded-2xl border border-[#E5E7EB] px-3.5 py-3 hover:border-[#65BD6C]/50 hover:shadow-sm transition-all active:scale-[0.995] cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", color.avatar)}>
          <span className="text-xs font-bold text-white">{displayName.charAt(0).toUpperCase()}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-bold text-[#1A1B1E] truncate">{displayName}</p>
            {patient.isFlagged && (
              <Flag
                className="w-3 h-3 text-[#036638] shrink-0"
                fill="#036638"
                aria-label="Flagged for Donna"
              />
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 min-w-0">
            <span
              className={cn(
                "inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0",
                color.chipBg,
                color.chipText,
                color.chipBorder,
              )}
            >
              {stageLabels[patient.stage] || patient.stage}
            </span>
            {patient.appointmentDatetime && (
              <span className="flex items-center gap-1 text-[11px] text-[#6B7280] min-w-0">
                <Calendar className="w-3 h-3 shrink-0" />
                <span className="truncate">{formatAppointment(patient.appointmentDatetime)}</span>
              </span>
            )}
          </div>
        </div>

        {nextStage ? (
          <button
            type="button"
            disabled={isPending || !checklistComplete}
            onClick={(e) => {
              e.stopPropagation()
              onMoveStage(patient.id, nextStage)
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#036638] text-white hover:bg-[#025030] transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#036638]"
            title={
              isPending
                ? "Moving..."
                : checklistComplete
                  ? `Move to ${stageLabels[nextStage]}`
                  : "Complete the checklist to move to the next stage"
            }
          >
            {isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : checklistComplete ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <Lock className="w-3 h-3" />
            )}
            Next
          </button>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Done
          </span>
        )}
      </div>
    </div>
  )
}

function formatAppointment(datetime: string): string {
  try {
    return formatClinicDate(new Date(datetime), { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return datetime
  }
}
