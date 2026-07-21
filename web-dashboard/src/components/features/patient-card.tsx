"use client"

import type { Patient, PatientStage } from "@/types"
import { STAGE_ORDER, STAGE_LABELS } from "@/types"
import { AlertTriangle, Flag, Clock, ArrowLeft, ArrowRight, CheckSquare, Square, Lock, Phone } from "lucide-react"
import { cn } from "@/lib/utils"
import { STALE_HOURS } from "@/constants"
import { useChecklistItems, useListVas, useAssignPatient } from "@/hooks/query/usePatients"
import { useAuth } from "@/hooks/auth/useAuth"

interface PatientCardProps {
  patient: Patient
  onMoveStage: (id: string, target: PatientStage) => void
  onClick: (patient: Patient) => void
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
}

function isStale(updatedAt: string): boolean {
  const updated = new Date(updatedAt).getTime()
  const now = Date.now()
  const diffHours = (now - updated) / (1000 * 60 * 60)
  return diffHours > STALE_HOURS
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return "< 1h ago"
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function PatientCard({ patient, onMoveStage, onClick, isDragging, onDragStart, onDragEnd }: PatientCardProps) {
  const stale = patient.stage !== "reconciled" && isStale(patient.updatedAt)
  const currentIdx = STAGE_ORDER.indexOf(patient.stage)
  const canAdvance = currentIdx < STAGE_ORDER.length - 1
  const canRetreat = currentIdx > 0
  const { data: checklistDefs } = useChecklistItems()
  const { user: currentUser } = useAuth()
  const { data: vaList } = useListVas()
  const assignPatient = useAssignPatient()

  // — Checklist progress for this stage —
  const stageDefs = checklistDefs?.filter((d) => d.stage === patient.stage) || []
  const stageState = patient.checklistState?.[patient.stage] || {}
  const completedCount = stageDefs.filter((d) => stageState[d.id] === true).length
  const totalCount = stageDefs.length
  const allComplete = totalCount > 0 ? completedCount === totalCount : true
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100

  // — Assignment-gated stage changes —
  const isAdmin = currentUser?.role === "admin"
  const isAssignedUser = !!patient.assignedTo && patient.assignedTo === currentUser?.id
  const canMoveStage = !isAdmin && isAssignedUser

  return (
    <div
      draggable={canMoveStage}
      onClick={() => onClick(patient)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "bg-white rounded-lg border p-3.5 transition-all duration-150 relative",
        canMoveStage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        "hover:shadow-md hover:border-[#F2994A]/40 hover:-translate-y-0.5",
        "active:shadow-sm active:translate-y-0",
        stale
          ? "border-amber-300 shadow-[0_0_0_1px_#FDE68A]"
          : "border-[#E5E7EB]",
        patient.isFlagged && "bg-[#FFFAF5] border-[#E8792E] border-l-[3px] shadow-[0_0_0_1px_#E8792E]/20",
        isDragging && "opacity-50 scale-95 shadow-lg rotate-2",
      )}
    >
      {/* — Header: Name + badges — */}
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-sm font-semibold text-[#1A1B1E] leading-tight truncate">
              {patient.name}
            </h1>
            {patient.bookingPlatform && (
              <span className="text-[9px] font-medium text-[#6B7280] bg-[#F3F4F6] px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                {patient.bookingPlatform}
              </span>
            )}
            <span className="text-[9px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">
              {patient.source === "webhook" ? "Web" : "Manual"}
            </span>
          </div>
          {patient.email && (
            <p className="text-[11px] text-[#6B7280] truncate mt-0.5">{patient.email}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {patient.isFlagged && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#E8792E]/10 border border-[#E8792E]/20 text-[9px] font-semibold text-[#E8792E]">
              <Flag className="w-2.5 h-2.5" fill="#E8792E" />
              Flagged
            </span>
          )}
          {stale && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[9px] font-semibold text-amber-600">
              <AlertTriangle className="w-2.5 h-2.5" />
              Stale
            </span>
          )}
        </div>
      </div>

      {/* — Info row: appointment + phone — */}
      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
        {patient.appointmentDatetime && (
          <p className="text-[11px] text-[#6B7280] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(patient.appointmentDatetime).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
        {patient.phone && (
          <p className="text-[11px] text-[#6B7280] flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {patient.phone}
          </p>
        )}
      </div>

      {/* — Assigned user — */}
      {patient.assignedUser ? (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-4 h-4 rounded-full bg-[#E8792E]/10 flex items-center justify-center">
            <span className="text-[8px] font-bold text-[#E8792E]">
              {patient.assignedUser.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-[10px] text-[#E8792E] font-medium">
            {patient.assignedUser.name}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center">
            <span className="text-[8px] font-bold text-gray-400">?</span>
          </div>
          <span className="text-[10px] text-gray-400 italic">Unassigned</span>
        </div>
      )}

      {/* — Checklist progress — */}
      {totalCount > 0 ? (
        <div className="mb-2 px-0.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[#6B7280] flex items-center gap-1">
              {allComplete ? (
                <CheckSquare className="w-3 h-3 text-emerald-500" />
              ) : (
                <Square className="w-3 h-3 text-[#6B7280]" />
              )}
              Checklist
            </span>
            <span className={cn(
              "text-[10px] font-bold",
              allComplete ? "text-emerald-600" : "text-[#E8792E]"
            )}>
              {completedCount}/{totalCount}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                allComplete ? "bg-emerald-500" : "bg-[#E8792E]"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* Individual checklist items (compact) */}
          <div className="mt-1.5 space-y-0.5">
            {stageDefs.map((item) => {
              const checked = stageState[item.id] === true
              return (
                <div key={item.id} className="flex items-center gap-1.5">
                  {checked ? (
                    <CheckSquare className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <Square className="w-3 h-3 text-gray-300 flex-shrink-0" />
                  )}
                  <span className={cn(
                    "text-[10px] leading-tight truncate",
                    checked ? "text-gray-400 line-through" : "text-[#1A1B1E]"
                  )}>
                    {item.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Empty state for stages with no checklist */
        <div className="mb-2 flex items-center gap-1">
          <CheckSquare className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] text-emerald-600 font-medium">No checklist required</span>
        </div>
      )}

      {/* — Footer: timestamp + move buttons — */}
      <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB]/50">
        <span className="text-[10px] text-[#6B7280]">{timeAgo(patient.updatedAt)}</span>

        {canMoveStage ? (
          <div className="flex items-center gap-1">
            {canRetreat && (
              <button
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveStage(patient.id, STAGE_ORDER[currentIdx - 1])
                }}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium
                  text-[#6B7280] hover:bg-gray-100 hover:text-[#1A1B1E] transition-colors"
                title={`Move back to ${STAGE_LABELS[STAGE_ORDER[currentIdx - 1]]}`}
              >
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>
            )}
            {canAdvance && (
              <button
                draggable={false}
                disabled={!allComplete}
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveStage(patient.id, STAGE_ORDER[currentIdx + 1])
                }}
                className={cn(
                  "flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                  allComplete
                    ? "bg-[#E8792E] text-white hover:bg-[#d46b24]"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                )}
                title={
                  allComplete
                    ? `Move to ${STAGE_LABELS[STAGE_ORDER[currentIdx + 1]]}`
                    : "Complete all checklist items first"
                }
              >
                Move Next
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : (
          /* Admin can assign, or non-assigned see lock */
          isAdmin ? (
            <div className="relative inline-block w-[110px]" onClick={(e) => e.stopPropagation()}>
              <select
                onChange={(e) => {
                  const val = e.target.value
                  if (val) assignPatient.mutate({ id: patient.id, assignedTo: val })
                  e.target.value = ""
                }}
                value=""
                className="appearance-none w-full text-[10px] border border-[#E5E7EB] rounded px-2 py-0.5 pr-6 text-[#1A1B1E] bg-white cursor-pointer hover:border-[#F2994A]/40 focus:outline-none focus:ring-1 focus:ring-[#E8792E]"
                title="Assign VA"
              >
                <option value="">{patient.assignedTo ? "Reassign..." : "Assign VA..."}</option>
                {vaList?.filter(v => v.id !== currentUser?.id).map((va) => (
                  <option key={va.id} value={va.id}>
                    {va.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10px] text-gray-400" title="Only the assigned VA can move this patient">
              <Lock className="w-3 h-3" />
              <span>{patient.assignedTo ? "Not your patient" : "Unassigned"}</span>
            </div>
          )
        )}
      </div>
    </div>
  )
}
