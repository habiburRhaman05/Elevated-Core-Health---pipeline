"use client"

import { useState } from "react"
import type { Patient, PatientStage } from "@/types"
import {
  Flag,
  Clock,
  ArrowLeft,
  ArrowRight,
  Mail,
  ChevronDown,
  Loader2,
  Calendar,
  Check,
  X,
  Globe,
  User,
  AlertTriangle,
  Lock,
} from "lucide-react"
import { cn, getInitials } from "@/lib/utils"
import { formatClinicDateTime } from "@/lib/clinic-time"
import { STALE_HOURS } from "@/constants"
import { useChecklistItems, useListVas, useAssignPatient } from "@/hooks/query/usePatients"
import { useStageMeta } from "@/hooks/query/useStages"
import { useAuth } from "@/hooks/auth/useAuth"
import { isAdminOrAbove } from "@/lib/roles"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"

interface PatientCardProps {
  patient: Patient
  onMoveStage: (id: string, target: PatientStage) => void | Promise<unknown>
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
  const minutes = Math.floor(diff / (1000 * 60))
  // Under an hour: show the actual minute count instead of a vague "<1h ago".
  if (minutes < 60) return `${Math.max(minutes, 0)}m ago`
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// How many checklist rows show before the "+N more" toggle — keeps the card
// compact by default; the reference design shows 2 then collapses the rest.
const VISIBLE_ITEMS = 2

// Flat, single-tone state colors — no gradients. Priority mirrors the header
// badge: a flagged or stale card must be unmistakable at a glance, so it
// overrides the calmer default/unassigned tones.
function stateAvatarClass(patient: Patient, stale: boolean): string {
  if (patient.isFlagged) return "bg-red-400"
  if (stale) return "bg-green-300"
  if (!patient.assignedUser) return "bg-lime-600"
  return "bg-[#036638]"
}

// Compact, arrow-driven assign control. A single pill opens the VA list —
// the assignee (or "Assign") is always visible on the trigger, and the list
// marks the current owner with a check so reassigns are one click.
function AssignArrowMenu({
  patient,
  vaList,
  assigning,
  onAssign,
}: {
  patient: Patient
  vaList?: { id: string; name: string }[]
  assigning: boolean
  onAssign: (vaId: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          draggable={false}
          disabled={assigning}
          onClick={(e) => e.stopPropagation()}
          title={patient.assignedTo ? "Reassign VA" : "Assign VA"}
          className="inline-flex items-center gap-1.5 font-semibold transition-colors select-none
            disabled:opacity-60 disabled:cursor-wait cursor-pointer
            bg-white hover:bg-[#F9FAFB] border border-[#E5E7EB] text-[#1A1B1E] rounded-full px-3 py-1.5 text-xs"
        >
          {assigning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#036638]" />
          ) : (
            <User className="w-3.5 h-3.5 text-[#036638]" />
          )}
          <span className="max-w-[100px] truncate">{patient.assignedUser?.name ?? "Assign"}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-semibold text-[#6B7280]">
          Assign to
        </DropdownMenuLabel>
        {vaList?.length ? (
          vaList.map((va) => (
            <DropdownMenuItem
              key={va.id}
              disabled={assigning}
              onSelect={() => onAssign(va.id)}
              className="cursor-pointer text-xs"
            >
              <span className="flex-1 truncate">{va.name}</span>
              {va.id === patient.assignedTo && <Check className="w-3.5 h-3.5 text-emerald-600" />}
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-gray-400">No VAs available</div>
        )}
        {patient.assignedTo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={assigning}
              onSelect={() => onAssign("")}
              className="cursor-pointer text-xs text-red-600 focus:text-red-600"
            >
              <X className="w-3.5 h-3.5" />
              Unassign
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PatientCard({ patient, onMoveStage, onClick, isDragging, onDragStart, onDragEnd }: PatientCardProps) {
  const { order: stageOrder, byKey: stageByKey } = useStageMeta()
  const isFinalStage = stageByKey.get(patient.stage)?.isFinal ?? false
  const stale = !isFinalStage && isStale(patient.updatedAt)
  // Klarity's appointment.canceled webhook (and the admin-only manual cancel)
  // both set this — struck through so a cancelled slot never reads like a live one.
  const isCancelled = patient.status === "cancelled"
  const currentIdx = stageOrder.indexOf(patient.stage)
  const canAdvance = currentIdx < stageOrder.length - 1
  const canRetreat = currentIdx > 0
  const { data: checklistDefs } = useChecklistItems()
  const { user: currentUser } = useAuth()
  const { data: vaList } = useListVas()
  const assignPatient = useAssignPatient()
  const [assigning, setAssigning] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Which direction's move is in flight — shows a spinner on that button.
  const [moving, setMoving] = useState<"back" | "next" | null>(null)
  // Phase 3 shared editing: board is open - any VA or admin can move any patient.
  const isAdmin = isAdminOrAbove(currentUser?.role)
  const canMoveStage = true

  // - Checklist progress for this stage (only REQUIRED items gate moves) -
  const stageDefs = checklistDefs?.filter((d) => d.stage === patient.stage) || []
  const stageState = patient.checklistState?.[patient.stage] || {}
  const requiredDefs = stageDefs.filter((d) => d.status === "required")
  const completedCount = requiredDefs.filter((d) => stageState[d.id] === true).length
  const totalCount = requiredDefs.length
  const allComplete = totalCount > 0 ? completedCount === totalCount : true
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100
  const visibleDefs = expanded ? stageDefs : stageDefs.slice(0, VISIBLE_ITEMS)
  const hiddenCount = stageDefs.length - visibleDefs.length

  // Admin can assign any user (VAs + admin). VAs can only self-assign.
  const assignableVas = isAdmin
    ? vaList
    : vaList?.filter((v) => v.id === currentUser?.id)

  const handleAssign = (vaId: string) => {
    setAssigning(true)
    assignPatient.mutate(
      { id: patient.id, assignedTo: vaId || null },
      { onSettled: () => setAssigning(false) },
    )
  }

  // Fire a stage move and keep the button spinning until it settles. The
  // boards' handleMoveStage returns the mutation promise; if a caller ever
  // returns void (fire-and-forget), clear the spinner immediately instead of
  // spinning forever.
  const handleMove = (dir: "back" | "next") => {
    if (moving) return
    const target = dir === "back" ? stageOrder[currentIdx - 1] : stageOrder[currentIdx + 1]
    if (!target) return
    setMoving(dir)
    const result = onMoveStage(patient.id, target)
    if (result && typeof (result as Promise<unknown>).then === "function") {
      ;(result as Promise<unknown>).catch(() => {}).finally(() => setMoving(null))
    } else {
      setMoving(null)
    }
  }

  // One state badge, priority order — a card is flagged, or stale, or
  // unassigned, or (the calm default) fine.
  const headerBadge = patient.isFlagged
    ? { icon: Flag, label: "Flagged", cls: "bg-red-50 border-red-200 text-red-600" }
    : stale
      ? { icon: Clock, label: "Stale", cls: "bg-amber-50 border-amber-200 text-amber-700" }
      : !patient.assignedUser
        ? { icon: User, label: "Unassigned", cls: "bg-lime-50 border-lime-200 text-lime-700" }
        : { icon: Check, label: "On track", cls: "bg-emerald-50 border-emerald-200 text-emerald-700" }
  const BadgeIcon = headerBadge.icon

  // Where the patient came from. This used to be the last fallback of the badge
  // above, which meant it only ever appeared on assigned, unflagged, non-stale
  // cards — a webhook-created card was almost always "Unassigned" first, so the
  // source never showed. It is its own chip now, so it is always visible.
  // bookingPlatform is the more specific of the two (klarity/zocdoc/...) and
  // wins; `source` (webhook/manual/import) is the fallback.
  const originLabel = (patient.bookingPlatform || patient.source || "").replace(/_/g, " ")

  return (
    <div
      draggable={canMoveStage}
      onClick={() => onClick(patient)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "relative bg-white rounded-3xl border p-3.5 sm:p-4 transition-all duration-150",
        canMoveStage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        "hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5",
        "active:shadow-md active:translate-y-0",
        patient.isFlagged
          ? "border-red-200"
          : stale
            ? "border-amber-200"
            : "border-[#EDEFF2]",
        "shadow-[0_1px_3px_rgba(16,24,40,0.06)]",
        isDragging && "opacity-50 scale-95 shadow-lg",
      )}
    >
      {/* - Header: avatar + name + one status badge + appointment - */}
      <div className="flex items-start gap-2.5 min-w-0">
        <div
          className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0",
            stateAvatarClass(patient, stale),
          )}
        >
          {getInitials(patient.name)}
        </div>
        <div className="flex flex-col min-w-0 flex-1 gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-bold text-[#12141A] leading-tight truncate">
              {patient.name}
            </h1>
            {/* Last-updated pinned top-right, out of the way of the main content. */}
            <span className="flex items-center gap-1 text-[11px] text-[#9CA3AF] shrink-0 pt-0.5">
              <Clock className="w-3 h-3" />
              {timeAgo(patient.updatedAt)}
            </span>
          </div>
          {patient.email && (
            <p className="flex items-center gap-1.5 text-sm text-[#6B7280] min-w-0">
              <Mail className="w-3.5 h-3.5 text-[#036638] shrink-0" />
              <span className="truncate">{patient.email}</span>
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border",
                headerBadge.cls,
              )}
            >
              <BadgeIcon className="w-3 h-3" fill={patient.isFlagged ? "currentColor" : "none"} />
              {headerBadge.label}
            </span>
            {/* Origin chip — always shown, independent of the state badge above */}
            {originLabel && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600"
                title={`Source: ${patient.source}`}
              >
                <Globe className="w-3 h-3" />
                {originLabel}
              </span>
            )}
            {/* Lock chip — only when the record is locked; nothing shows when unlocked */}
            {patient.isPrivate && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-700">
                <Lock className="w-3 h-3" />
                Locked
              </span>
            )}
            <span className="w-px h-3.5 bg-[#E5E7EB]" />
            <span className="inline-flex items-center gap-1.5 text-[#6B7280]">
              <Calendar className={cn("w-3.5 h-3.5", isCancelled ? "text-red-500" : "text-[#9CA3AF]")} />
              {patient.appointmentDatetime ? (
                <span
                  className={cn(
                    "font-medium",
                    isCancelled ? "text-red-400 line-through decoration-2" : "text-[#374151]",
                  )}
                >
                  {formatClinicDateTime(new Date(patient.appointmentDatetime), {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              ) : (
                "No appointment"
              )}
              {isCancelled && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-red-600">Cancelled</span>
              )}
            </span>
          </div>

         
        </div>
      </div>

      <div className="my-3 border-t border-[#EDEFF2]" />

      {/* - Checklist: required count + progress + collapsible item list -
          or, if this stage has no checklist items configured at all, a
          visible warning rather than silently showing nothing (a stage with
          zero items still lets cards move through it unchecked). */}
      {stageDefs.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-2 py-1">
          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
          <p className="text-sm font-medium text-amber-700">No checklist configured for this stage</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#F6F8F7] px-2.5 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-[#12141A]">Required</span>
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#6B7280]">
                {completedCount}/{totalCount}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-white border-[#036638]/25 text-[#036638]">
                {progressPct}%
              </span>
            </span>
          </div>
          <div className="w-full h-1.5 bg-white rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-[#036638] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="space-y-1">
            {visibleDefs.map((item) => {
              const checked = stageState[item.id] === true
              return (
                <label
                  key={item.id}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 cursor-default"
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded border shrink-0 flex items-center justify-center",
                      checked ? "bg-[#036638] border-[#036638]" : "border-[#C7CDC9] bg-white",
                    )}
                  >
                    {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  <span className="text-sm text-[#1A1B1E] truncate">{item.label}</span>
                </label>
              )
            })}
          </div>
          {hiddenCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(true)
              }}
              className="mt-2 flex items-center gap-1 text-sm font-semibold text-[#036638] hover:underline"
            >
              + {hiddenCount} more requirement{hiddenCount > 1 ? "s" : ""}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {expanded && stageDefs.length > VISIBLE_ITEMS && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(false)
              }}
              className="mt-2 text-sm font-semibold text-[#6B7280] hover:underline"
            >
              Show less
            </button>
          )}
        </div>
      )}

      <div className="my-3 border-t border-[#EDEFF2]" />

      {/* - Footer: assign + move, all in one row - */}
      <div className="flex items-center justify-between gap-2">
        {assignableVas && assignableVas.length > 0 && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <AssignArrowMenu
              patient={patient}
              vaList={assignableVas}
              assigning={assigning}
              onAssign={handleAssign}
            />
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {canMoveStage && canRetreat && (
            <button
              draggable={false}
              disabled={moving !== null}
              onClick={(e) => {
                e.stopPropagation()
                handleMove("back")
              }}
              title="Move back one stage"
              className="flex items-center justify-center gap-1 shrink-0 px-2.5 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs font-bold text-[#6B7280] hover:bg-gray-50 hover:text-[#12141A] active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {moving === "back" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowLeft className="w-3.5 h-3.5" />
              )}
              Back
            </button>
          )}
          {canMoveStage && canAdvance && (
            <button
              draggable={false}
              disabled={!allComplete || moving !== null}
              onClick={(e) => {
                e.stopPropagation()
                handleMove("next")
              }}
              className={cn(
                "shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold transition-colors",
                allComplete
                  ? "bg-[#036638] text-white hover:bg-[#025030]"
                  : "bg-[#F1F2F0] text-[#9CA3AF] cursor-not-allowed",
                moving === "next" && "opacity-70 cursor-wait",
              )}
              title={allComplete ? "Move to next stage" : "Tick every required item before moving this card forward."}
            >
              {moving === "next" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Moving...
                </>
              ) : (
                <>
                  Move Next
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
