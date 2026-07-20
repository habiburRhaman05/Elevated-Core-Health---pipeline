"use client"

import type { Patient, PatientStage } from "@/types"
import { STAGE_LABELS, STAGE_HINTS, STAGE_ORDER } from "@/types"
import { AlertTriangle, Flag, Clock, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { STALE_HOURS } from "@/constants"

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

  return (
    <div
      draggable
      onClick={() => onClick(patient)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "bg-white rounded-lg border p-3.5 cursor-grab active:cursor-grabbing transition-all duration-150",
        "hover:shadow-md hover:border-[#F2994A]/40 hover:-translate-y-0.5",
        "active:shadow-sm active:translate-y-0",
        stale
          ? "border-amber-300 shadow-[0_0_0_1px_#FDE68A]"
          : "border-[#E5E7EB]",
        patient.isFlagged && "border-l-[3px] border-l-[#E8792E]",
        isDragging && "opacity-50 scale-95 shadow-lg rotate-2",
      )}
    >
      <div className="flex items-start justify-between mb-2 gap-2">
        <p className="text-sm font-semibold text-[#1A1B1E] leading-tight truncate flex-1">
          {patient.name}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {patient.isFlagged && (
            <Flag className="w-3.5 h-3.5 text-[#E8792E]" fill="#E8792E" />
          )}
          {stale && (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          )}
        </div>
      </div>

      {patient.appointmentDatetime && (
        <p className="text-[11px] text-[#6B7280] mb-1.5 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(patient.appointmentDatetime).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}

      {patient.assignedUser && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-4 h-4 rounded-full bg-[#E8792E]/10 flex items-center justify-center">
            <span className="text-[8px] font-bold text-[#E8792E]">
              {patient.assignedUser.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-[10px] text-[#E8792E] font-medium">
            {patient.assignedUser.name}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#E5E7EB]/50">
        <span className="text-[10px] text-[#6B7280]">{timeAgo(patient.updatedAt)}</span>
        <div className="flex items-center gap-0.5">
          {canRetreat && (
              <button
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveStage(patient.id, STAGE_ORDER[currentIdx - 1])
                }}
                className="p-0.5 rounded hover:bg-[#FFF0E5] text-[#6B7280] hover:text-[#E8792E] transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
            {canAdvance && (
              <button
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveStage(patient.id, STAGE_ORDER[currentIdx + 1])
                }}
                className="p-0.5 rounded hover:bg-[#FFF0E5] text-[#6B7280] hover:text-[#E8792E] transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
          )}
        </div>
      </div>
    </div>
  )
}
