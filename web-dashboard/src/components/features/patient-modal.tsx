"use client"




import { useState, useEffect, useMemo, useRef } from "react"

import type { Patient, PatientFlag, PatientStage } from "@/types"
import { ROLES, STALE_HOURS } from "@/constants"
import { useStageMeta } from "@/hooks/query/useStages"
import {
  X,
  Flag,
  FlagOff,
  Check,
  Circle,
  CheckCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
  ListX,
  Loader2,
  UserCheck,
  ChevronDown,
  ChevronRight,
  Zap,
  Shield,
  ShieldCheck,
  Lock,
  Unlock,
  RefreshCw,
  Calendar,
  Pencil,
  UserPlus,
  Phone,
  Mail,
  Globe,
  LayoutGrid,
  User,
  MoreVertical,
  HelpCircle,
  ClipboardList,
  ArrowLeft,
  ArrowRight,
  Clock,
  Info,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { DateTimePicker, DatePicker, getMinAppointmentDate, getMaxDobDate } from "@/components/ui/date-time-picker"
import { useAuth } from "@/hooks/auth/useAuth"
import { isAdminOrAbove, roleLabel } from "@/lib/roles"
import {
  useMoveStage,
  useToggleChecklist,
  useAddNote,
  useDeleteNote,
  useFlagPatient,
  useClearFlag,
  useClaimPatient,
  useAssignPatient,
  useChecklistItems,
  useListVas,
  useUpdatePatient,
  useLockPatient,
  useUnlockPatient,
  useUpdatePatientStatus,
  useUpdateAppointment,
} from "@/hooks/query/usePatients"
import { usePatient } from "@/hooks/query/usePatients"
import { useActivityLog } from "@/hooks/query/useActivityLog"
import { useConversationByPatient, useRealtimeMessaging } from "@/hooks/query/useMessaging"
import { MessageThread } from "./messaging/message-thread"
import { SelectOrOther } from "@/components/shared/select-or-other"
import { LocationCombobox } from "@/components/shared/location-combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EligibilityCheckDialog } from "./eligibility-check-dialog"
import { PAYMENT_METHOD_OPTIONS, INSURANCE_PROVIDER_OPTIONS, VISIT_STATUS_OPTIONS, VOB_LABELS } from "@/lib/patient-options"
import { getStageColor } from "@/lib/stage-colors"
import { actionMeta, fullDateTime } from "@/lib/activity-meta"
import { cn, getInitials } from "@/lib/utils"
import { isValidUsPhone, formatUsPhone } from "@/lib/us-phone"
import { toast } from "sonner"
import z from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

interface PatientModalProps {
  patientId: string | null
  open: boolean
  onClose: () => void
}

const STAGE_SOPs: Record<PatientStage, string[]> = {
  onboarding: [
    "Confirm appointment date and time in calendar",
    "Verify patient contact information (phone, email)",
    "Send welcome email with pre-visit instructions",
    "Ensure intake form is completed",
  ],
  visit_complete: [
    "Document visit completion in Optimantra",
    "Verify all vital signs recorded",
    "Confirm provider's clinical notes entered",
    "Flag any abnormalities for review",
  ],
  post_visit_docs: [
    "Generate and send patient instruction letter",
    "Order and submit required lab work",
    "Attach lab request forms to patient record",
    "Confirm patient received all documents",
  ],
  chart_signed: [
    "Ensure Optimantra note is signed by provider",
    "Run pre-billing clawback check",
    "Verify CPT codes match services rendered",
    "Confirm ICD-10 codes are documented",
    "Check documentation supports diagnosis",
  ],
  sent_to_billing: [
    "Verify claim submission to billing system",
    "Record claim number and submission date",
    "Set follow-up reminder for claim status",
    "Attach claim submission confirmation",
  ],
  payment_posted: [
    "Record payment amount and date received",
    "Match payment to submitted claim",
    "Update insurance payer information",
    "Flag any payment discrepancies",
  ],
  reconciled: [
    "Verify all payments received match billing",
    "Close patient record in system",
    "Archive supporting documentation",
    "Record final reconciliation details",
  ],
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  // Under an hour: show the actual minute count instead of a vague "< 1h ago".
  if (minutes < 60) return `${Math.max(minutes, 0)}m ago`
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function toLocalDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Returns a usable avatar URL for a patient. Falls back to an auto-generated
 * "initials" avatar (via DiceBear) whenever the patient has no real photo on
 * file, so the UI never shows a broken image or an empty circle.
 */
function getAvatarUrl(patient: Patient): string {
  const withPhoto = patient as Patient & {
    avatarUrl?: string | null
    photoUrl?: string | null
    avatar?: string | null
    imageUrl?: string | null
  }
  const existing =
    withPhoto.avatarUrl || withPhoto.photoUrl || withPhoto.avatar || withPhoto.imageUrl
  if (existing) return existing
  const seed = encodeURIComponent(patient.name?.trim() || "Patient")
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=059669,0d9488,047857,10b981&fontFamily=Helvetica&fontWeight=600`
}

// ---------------------------------------------------------------------------
// Patient contact info validation (react-hook-form + zod)
// ---------------------------------------------------------------------------
// US phone validation + formatting live in @/lib/us-phone so the patient modal
// and the Add Patient dialog stay identical.

const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  // Optional, not required: the field is disabled/read-only in this form (see
  // the input below), so a patient with no email on file must still be able
  // to save every other change instead of getting permanently stuck on a
  // required field they have no way to fill in here.
  email: z.string().trim().email("Enter a valid email address").optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .refine(isValidUsPhone, {
      message: "Enter a valid US phone number, e.g. (555) 123-4567",
    }),
  location: z.string().trim().max(120, "Location is too long").optional().or(z.literal("")),
  dateOfBirth: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || new Date(v).getTime() <= getMaxDobDate().getTime(), {
      message: "Patient must be at least 18 years old",
    }),
  copayAmount: z.string().trim().optional().or(z.literal("")),
  amountPaid: z.string().trim().optional().or(z.literal("")),
})

type ContactFormValues = z.infer<typeof contactSchema>

function splitPatientName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

type TabKey = "overview" | "contact" | "eligibility" | "checklist" | "flags" | "messages" | "activity" | "notes"

// Small donut/ring progress indicator used in the Overview → SOP card.
function ProgressRing({ percent, label, sublabel }: { percent: number; label: string; sublabel: string }) {
  const size = 108
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percent / 100)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#059669"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold text-[#12141A] leading-none">{label}</span>
        <span className="text-[10px] font-semibold text-gray-500 mt-1">{sublabel}</span>
      </div>
    </div>
  )
}

// Sidebar info row: icon box + label + value + optional action slot.
function SidebarItem({
  icon,
  iconBg,
  iconColor,
  label,
  labelColor,
  children,
  action,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  labelColor?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", iconBg, iconColor)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-0.5", labelColor || "text-gray-400")}>
          {label}
        </p>
        <div className="text-sm font-bold text-[#12141A]">{children}</div>
        {action && <div className="mt-1.5">{action}</div>}
      </div>
    </div>
  )
}

// Inline "Clear Flag" form — admin writes feedback before clearing a flag.
function FlagClearForm({
  clearReason,
  setClearReason,
  isPending,
  onClear,
  onCancel,
}: {
  clearReason: string
  setClearReason: (v: string) => void
  isPending: boolean
  onClear: () => void
  onCancel: () => void
}) {
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-white/80 border border-gray-200 p-3">
      <Textarea
        placeholder="Write your feedback / reason for clearing this flag..."
        value={clearReason}
        onChange={(e) => setClearReason(e.target.value)}
        className="text-xs min-h-[64px] rounded-lg"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onClear}
          disabled={!clearReason.trim() || isPending}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs gap-1.5"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isPending ? "Clearing..." : "Confirm Clear"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-xs text-gray-600">
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function PatientModal({ patientId, open, onClose }: PatientModalProps) {
  const { user } = useAuth()
  const isAdmin = isAdminOrAbove(user?.role)
  const isAdminFlag = (flag?: PatientFlag | null) =>
    !!flag?.flaggedByUser && isAdminOrAbove(flag.flaggedByUser.role)
  const { order: stageOrder, labels: stageLabels, byKey: stageByKey } = useStageMeta()
  const { data: patient, isLoading } = usePatient(patientId || "")
  const { data: logData } = useActivityLog(
    patientId ? { patientId, limit: 20 } : undefined,
  )
  const { data: conversationData, isLoading: isLoadingConversation } = useConversationByPatient(patientId || undefined)
  const smsConversation = conversationData?.conversation ?? null
  const smsUnreadCount = smsConversation?.unreadCount ?? 0
  // Real-time push — updates messages live when Pusher is configured.
  useRealtimeMessaging(smsConversation?.id)

  const moveStage = useMoveStage()
  // Stage currently receiving a move — the stage-stepper + Move Next buttons
  // show a spinner and lock while the request is in flight.
  const [movingStage, setMovingStage] = useState<PatientStage | null>(null)
  const toggleChecklist = useToggleChecklist()
  const addNote = useAddNote()
  const deleteNote = useDeleteNote()
  const flagPatient = useFlagPatient()
  const clearFlag = useClearFlag()
  const claimPatient = useClaimPatient()
  const assignPatient = useAssignPatient()
  const updatePatient = useUpdatePatient()
  const lockPatient = useLockPatient()
  const unlockPatient = useUnlockPatient()
  const updateStatus = useUpdatePatientStatus()

  const { data: checklistDefs } = useChecklistItems()

  const currentStageItems = useMemo(() => {
    if (!checklistDefs || !patient) return []
    return checklistDefs
      .filter((item) => item.stage === patient.stage)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }, [checklistDefs, patient])

  const currentState = patient?.checklistState?.[patient.stage] || {}

  const flagHistory = patient?.flags ?? []
  const latestFlag = flagHistory[0] ?? null
  const flagTotalCount = flagHistory.length
  const flagStageCount = flagHistory.filter((f) => f.stage === patient?.stage).length

  const requiredItems = currentStageItems.filter((item) => item.status === "required")
  const totalItems = requiredItems.length
  const completedItems = requiredItems.filter(
    (item) => currentState[item.id] === true,
  ).length
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100
  const allComplete = totalItems === 0 || completedItems === totalItems

  const { data: vaList } = useListVas()

  const [activeTab, setActiveTab] = useState<TabKey>("overview")
  const [showMenu, setShowMenu] = useState(false)
  const [menuPending, setMenuPending] = useState<"reactivate" | "unlock" | "lock" | null>(null)
  const [newNoteText, setNewNoteText] = useState("")
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)
  const [flagReason, setFlagReason] = useState("")
  const [showFlagInput, setShowFlagInput] = useState(false)
  const [flagStage, setFlagStage] = useState<PatientStage | "">("")
  const [showFlagPopup, setShowFlagPopup] = useState(false)
  const [newFlagReason, setNewFlagReason] = useState("")
  const [newFlagType, setNewFlagType] = useState<"positive" | "negative">("positive")
  const [clearReason, setClearReason] = useState("")
  const [clearingFlagId, setClearingFlagId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState("")
  const [insuranceProvider, setInsuranceProvider] = useState("")
  const [paymentMethodOther, setPaymentMethodOther] = useState(false)
  const [insuranceProviderOther, setInsuranceProviderOther] = useState(false)
  const [visitStatus, setVisitStatus] = useState("not_visited")
  const [avatarError, setAvatarError] = useState(false)
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    mode: "onTouched",
    resolver: zodResolver(contactSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      location: "",
      phone: "",
      email: "",
      dateOfBirth: "",
      copayAmount: "0",
      amountPaid: "0",
    },
  })

  const contactInputClass = (hasError: boolean) =>
    cn(
      "w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 transition-colors",
      hasError
        ? "border-[#CC3333]/40 bg-[#CC3333]/5 focus:border-[#CC3333] focus:ring-[#CC3333]/25"
        : "border-gray-200 focus:border-emerald-400 focus:ring-emerald-400/30",
    )
  const contactLabelClass = (hasError: boolean) =>
    cn(
      "text-[10px] font-bold uppercase tracking-wider block mb-1",
      hasError ? "text-[#CC3333]" : "text-gray-500",
    )
  const [cancelReason, setCancelReason] = useState("")
  const [showCancelInput, setShowCancelInput] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState(false)
  const [newAppointmentDatetime, setNewAppointmentDatetime] = useState("")
  const [showEligibilityCheck, setShowEligibilityCheck] = useState(false)
  const updateAppointment = useUpdateAppointment()

  const [bulkPending, setBulkPending] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignFeedback, setAssignFeedback] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)
  const assignFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [checklistPending, setChecklistPending] = useState<Set<string>>(new Set())
  const checklistBusy = bulkPending

  useEffect(() => () => {
    if (assignFeedbackTimer.current) clearTimeout(assignFeedbackTimer.current)
  }, [])

  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024,
  )
  useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia("(min-width: 1024px)")
    const sync = () => setIsDesktop(mql.matches)
    sync()
    mql.addEventListener("change", sync)
    return () => mql.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    const pm = patient?.paymentMethod ?? ""
    const ip = patient?.insuranceProvider ?? ""
    setPaymentMethod(pm)
    setInsuranceProvider(ip)
    setPaymentMethodOther(pm !== "" && !PAYMENT_METHOD_OPTIONS.includes(pm))
    setInsuranceProviderOther(ip !== "" && !INSURANCE_PROVIDER_OPTIONS.includes(ip))
    setVisitStatus(patient?.visitStatus ?? "not_visited")
  
    // Fallback: if firstName/lastName are ever missing (e.g. a row created
    // before the first/last split, or a webhook that only sent a full name),
    // derive them from the API's full `name` so the fields always show a value.
    const nameParts = splitPatientName(patient?.name ?? "")
    reset({
      firstName: patient?.firstName || nameParts.firstName,
      lastName: patient?.lastName || nameParts.lastName,
      location: patient?.location ?? "",
      phone: patient?.phone ?? "",
      email: patient?.email ?? "",
      dateOfBirth: patient?.dateOfBirth ?? "",
      copayAmount: patient?.copayAmount ?? "0",
      amountPaid: patient?.amountPaid ?? "0",
    })
    setShowFlagInput(false)
    setFlagReason("")
    setClearingFlagId(null)
    setClearReason("")
    setShowCancelInput(false)
    setCancelReason("")
    setEditingAppointment(false)
    setAvatarError(false)
    setActiveTab("overview")
    setShowMenu(false)
    setMenuPending(null)
    setShowAssignDropdown(false)
    setNewNoteText("")
    setDeletingNoteId(null)
    if (patient?.appointmentDatetime) {
      const dt = new Date(patient.appointmentDatetime)
      setNewAppointmentDatetime(toLocalDatetimeLocal(dt))
    } else {
      setNewAppointmentDatetime("")
    }
    setAssigning(false)
    setAssignFeedback(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id])


  useEffect(() => {
    const pm = patient?.paymentMethod ?? ""
    const ip = patient?.insuranceProvider ?? ""
    setPaymentMethod(pm)
    setInsuranceProvider(ip)
    setPaymentMethodOther(pm !== "" && !PAYMENT_METHOD_OPTIONS.includes(pm))
    setInsuranceProviderOther(ip !== "" && !INSURANCE_PROVIDER_OPTIONS.includes(ip))
    setVisitStatus(patient?.visitStatus ?? "not_visited")
  }, [patient?.paymentMethod, patient?.insuranceProvider, patient?.visitStatus])

  useEffect(() => {
    if (patient?.appointmentDatetime) {
      setNewAppointmentDatetime(toLocalDatetimeLocal(new Date(patient.appointmentDatetime)))
    } else {
      setNewAppointmentDatetime("")
    }
  }, [patient?.appointmentDatetime])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !assigning && !showEligibilityCheck) {
        onClose()
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [open, onClose, assigning, showEligibilityCheck])

 
  useEffect(() => {
    if (!open) return
    document.body.classList.add("patient-modal-open")
    return () => document.body.classList.remove("patient-modal-open")
  }, [open])

  const handleAddNote = async () => {
    if (!patient || !newNoteText.trim()) return
    await addNote.mutateAsync({ id: patient.id, content: newNoteText.trim() })
    setNewNoteText("")
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!patient) return
    setDeletingNoteId(noteId)
    await deleteNote.mutateAsync({ id: patient.id, noteId })
    setDeletingNoteId(null)
  }

  const handleFlag = async () => {
    if (!patient || !flagReason.trim()) return
    await flagPatient.mutateAsync({ id: patient.id, reason: flagReason })
    setShowFlagInput(false)
    setFlagReason("")
    setFlagStage("")
  }

  const handleClearFlag = async () => {
    if (!patient || !clearReason.trim()) return
    const flagId =
      clearingFlagId === "current"
        ? latestFlag?.id ?? undefined
        : clearingFlagId ?? undefined
    await clearFlag.mutateAsync({ id: patient.id, clearReason, flagId })
    setClearingFlagId(null)
    setClearReason("")
  }

  const flagHistoryRef = useRef<HTMLDivElement | null>(null)
  const scrollToFlagHistory = () => {
    setActiveTab("flags")
    requestAnimationFrame(() => {
      flagHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const handleMoveStage = async (target: PatientStage) => {
    if (!patient || movingStage) return
    const currentIdx = stageOrder.indexOf(patient.stage)
    const targetIdx = stageOrder.indexOf(target)
    if (targetIdx > currentIdx && !allComplete) return
    setMovingStage(target)
    try {
      await moveStage.mutateAsync({ id: patient.id, targetStage: target })
    } finally {
      setMovingStage(null)
    }
  }

  const handleClaim = async () => {
    if (!patient || !user) return
    await claimPatient.mutateAsync({ id: patient.id, userId: user.id })
  }

  const onSaveContact = handleSubmit(
    async (values) => {
      if (!patient) return
      await updatePatient.mutateAsync({
        id: patient.id,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        location: values.location?.trim() || null,
        phone: values.phone.trim(),
        email: values.email?.trim() || null,
        dateOfBirth: values.dateOfBirth?.trim() || null,
        copayAmount: values.copayAmount?.trim() || null,
        amountPaid: values.amountPaid?.trim() || null,
        paymentMethod: paymentMethod.trim() || null,
        insuranceProvider: insuranceProvider.trim() || null,
        visitStatus,
      })
    },
    // react-hook-form blocks the submit entirely when validation fails and,
    // by default, gives no feedback at all — clicking Save just does nothing,
    // which is indistinguishable from a broken button. This can trigger for a
    // field the user never touched (e.g. a date of birth already on file from
    // before this validation existed), so surface exactly which field and why.
    (formErrors) => {
      const first = Object.values(formErrors)[0]
      toast.error(first?.message ?? "Please fix the highlighted fields before saving")
    },
  )

  const handleCancelPatient = async () => {
    if (!patient) return
    await updateStatus.mutateAsync({ id: patient.id, status: "cancelled", reason: cancelReason.trim() || null })
    setShowCancelInput(false)
    setCancelReason("")
  }

  const runMenuAction = async (action: "reactivate" | "unlock" | "lock") => {
    if (!patient || menuPending) return
    setMenuPending(action)
    try {
      if (action === "reactivate") {
        await updateStatus.mutateAsync({ id: patient.id, status: "active" })
      } else if (action === "unlock") {
        await unlockPatient.mutateAsync(patient.id)
      } else {
        await lockPatient.mutateAsync(patient.id)
      }
    } catch {
    } finally {
      setMenuPending(null)
      setShowMenu(false)
    }
  }

  const handleUpdateAppointment = async () => {
    if (!patient || !newAppointmentDatetime.trim()) return
    if (new Date(newAppointmentDatetime).getTime() < getMinAppointmentDate().getTime()) {
      toast.error("Appointment date cannot be in the past")
      return
    }
    const isoDatetime = new Date(newAppointmentDatetime).toISOString()
    await updateAppointment.mutateAsync({ id: patient.id, appointmentDatetime: isoDatetime })
    setEditingAppointment(false)
  }

  const handleAssignTo = async (vaId: string) => {
    if (!patient || !vaId) return
    setAssigning(true)
    setAssignFeedback(null)
    try {
      await assignPatient.mutateAsync({ id: patient.id, assignedTo: vaId })
      const va = vaList?.find((v) => v.id === vaId)
      setAssignFeedback({ type: "success", message: `Assigned to ${va?.name ?? "VA"}` })
    } catch (err: unknown) {
      const apiMessage = (
        err as { response?: { data?: { message?: string } } }
      )?.response?.data?.message
      setAssignFeedback({
        type: "error",
        message: apiMessage || "Failed to assign this patient",
      })
    } finally {
      setAssigning(false)
      setShowAssignDropdown(false)
      if (assignFeedbackTimer.current) clearTimeout(assignFeedbackTimer.current)
      assignFeedbackTimer.current = setTimeout(() => setAssignFeedback(null), 4000)
    }
  }

  const handleBulkChecklist = async (checked: boolean) => {
    if (!patient) return
    const itemsToChange = currentStageItems.filter(
      (item) => !!currentState[item.id] !== checked,
    )
    if (itemsToChange.length === 0) {
      toast.info(checked ? "All items are already checked" : "No checklist items are checked")
      return
    }
    setBulkPending(true)
    try {
      for (const item of itemsToChange) {
        await toggleChecklist.mutateAsync({ id: patient.id, itemId: item.id, checked })
      }
      toast.success(`Checklist updated (${itemsToChange.length} item${itemsToChange.length > 1 ? "s" : ""})`)
    } catch {}
    finally {
      setBulkPending(false)
    }
  }

  const canLock =
    !!patient && (isAdmin || patient.assignedTo === user?.id)
  const canUnlock =
    !!patient &&
    (isAdmin || patient.assignedTo === user?.id || patient.privateLockedByUser?.id === user?.id)

// 1. Check if patient exists
// 2. Calculate the difference in hours between now and the appointment
// 3. Compare that difference against stale_hours

const isExpired = () => {
  // 1. Ensure patient exists and the specific property name matches your data source
  if (!patient || !patient.appointmentDatetime) {
    return false;
  }

  const appointmentTime = new Date(patient.appointmentDatetime).getTime();
  
  // 2. Check for invalid date
  if (isNaN(appointmentTime)) {
    return false; 
  }

  const currentTime = Date.now();
  
  // Calculate difference in hours
  const hoursDifference = (currentTime - appointmentTime) / (1000 * 60 * 60);
  
  // 3. Ensure 'stale_hours' is defined, or use a literal like 1
  const stale_hours = 1; 
  
  return hoursDifference > stale_hours;
};   

  const currentStageIdx = patient ? stageOrder.indexOf(patient.stage) : -1

  const sopItems = patient ? STAGE_SOPs[patient.stage] || [] : []

  const assignableVas = vaList?.filter((v) => v.id !== user?.id) ?? []

  if (!open) return null

  // Both layouts share the same 4 tabs (desktop & mobile) — no separate
  // Checklist tab.
  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <LayoutGrid className="w-4 h-4" /> },
    { key: "contact", label: "Contact & Payment", icon: <User className="w-4 h-4" /> },
    { key: "eligibility", label: "Eligibility Details", icon: <ShieldCheck className="w-4 h-4" /> },
    { key: "flags", label: "Flags", icon: <Flag className="w-4 h-4" /> },
    { key: "messages", label: "Messages", icon: <Phone className="w-4 h-4" /> },
    { key: "activity", label: "Activity Log", icon: <Clock className="w-4 h-4" /> },
    { key: "notes", label: "Notes", icon: <MessageSquare className="w-4 h-4" /> },
  ]

  return (
    <>
      {/* Desktop (lg+) — original desktop layout. Only mounted when the
          viewport is actually desktop-width — see the isDesktop effect
          above for why this can no longer be CSS-only (hidden lg:block). */}
      {isDesktop && (
      <div>
    <div className="fixed inset-0 z-100 flex items-center justify-center p-2 sm:p-4 lg:pl-[calc(var(--ech-sidebar-offset,8rem)*2)]
">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !assigning && onClose()}
      />
      <div className="relative w-full max-w-[1400px] h-[94vh] bg-white rounded-3xl shadow-2xl  overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
        {isLoading || !patient ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            {isLoading ? (
              <div className="flex flex-col items-center gap-5">
                <div className="relative w-24 h-24 sm:w-28 sm:h-28">
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#65BD6C] border-r-[#036638] animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[#EBF7EC] to-[#036638]/10 blur-md animate-pulse" />
                  <div className="absolute inset-3 rounded-full border border-[#65BD6C]/30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img
                      src="/logo.png"
                      alt="Elevated Core Health"
                      className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
                    />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-[#1A1B1E]">Loading patient details...</p>
                  <p className="text-[11px] text-[#6B7280] mt-1">
                    Elevated <span className="text-[#036638] font-semibold">Core Health</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#65BD6C] rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-[#65BD6C] rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <span className="w-1.5 h-1.5 bg-[#65BD6C] rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Patient not found</p>
            )}
          </div>
        ) : (
          <>
            {/* ---------------------------------------------------------- */}
            {/* Header                                                     */}
            {/* ---------------------------------------------------------- */}
            <div className="shrink-0 relative bg-gradient-to-r from-[#036638] via-[#0a7a44] to-emerald-600 border-b border-white/10 px-4 sm:px-8 py-4 sm:py-5 flex items-start justify-between gap-3 sm:gap-4">
            
              <div className="absolute -right-10 -top-12 w-44 h-44 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -right-2 -top-3 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
          {/* <div className="absolute right-24 -bottom-16 w-32 h-32 rounded-full bg-black/5 pointer-events-none" /> */}
              <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
                {avatarError ? (
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full shadow-sm shrink-0 bg-gradient-to-br from-lime-400 to-green-500 flex items-center justify-center text-white font-bold text-base sm:text-lg">
                    {getInitials(patient.name)}
                  </div>
                ) : (
                  <img
                    src={getAvatarUrl(patient)}
                    onError={() => setAvatarError(true)}
                    alt={patient.name}
                    className="w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover shadow-sm shrink-0 bg-gray-50"
                  />
                )}
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-2xl font-bold text-white truncate">{patient.name}</h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-white/90">
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      {patient.source === "webhook" ? "Web" : "Manual"}
                    </span>
                    {patient.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        {patient.phone}
                      </span>
                    )}
                    {patient.email && (
                      <span className="flex items-center gap-1.5 w-full sm:w-auto min-w-0 max-w-full overflow-hidden">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate min-w-0 flex-1">{patient.email}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {stageLabels[patient.stage]}
                    </span>
                    {patient.eligibilityStatus === "eligible" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Eligible
                      </span>
                    ) : patient.eligibilityStatus === "not_eligible" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-[#CC3333]/30 border border-[#FF8A8A]/40 text-white">
                        <XCircle className="w-3.5 h-3.5" />
                        Not Eligible
                      </span>
                    ) : null}
                    {patient.isFlagged && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-red-400 border border-red-400 text-white">
                        <Flag className="w-3.5 h-3.5" fill="currentColor" />
                        Flagged
                      </span>
                    )}
                    {isExpired() && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-400/25 border border-amber-300/40 text-amber-50">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Appointment Date Expired
                      </span>
                    )}
                    {patient.status !== "active" && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border",
                          patient.status === "completed"
                            ? "bg-sky-400/25 border-sky-300/40 text-sky-50"
                            : "bg-[#CC3333]/30 border-[#FF8A8A]/40 text-white",
                        )}
                      >
                        {patient.status === "completed" ? "Completed" : "Cancelled"}
                      </span>
                    )}
                    {patient.isPrivate && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-400/25 border border-amber-300/40 text-amber-50">
                        <Lock className="w-3.5 h-3.5" />
                        Locked
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2.5 shrink-0 min-w-0 max-w-full">
            
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <button
                    onClick={() => setShowFlagPopup(true)}
                    className="flex items-center gap-1.5 px-3 py-2 sm:px-3.5 rounded-xl bg-white border border-white text-xs sm:text-sm font-semibold text-[#036638] hover:bg-emerald-50 transition-colors shadow-sm"
                    title="Raise flag"
                  >
                    <Flag className="w-4 h-4 text-[#036638]" />
                    Flag
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowMenu((v) => !v)}
                      className="p-2 sm:p-2.5 rounded-xl border border-white/30 text-white hover:bg-white/10 transition-colors"
                      title="More actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {showMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => {
                            if (!menuPending) setShowMenu(false)
                          }}
                        />
                        <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-20">
                          {isAdmin && patient.status === "cancelled" && (
                            <button
                              onClick={() => runMenuAction("reactivate")}
                              disabled={menuPending !== null}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                              {menuPending === "reactivate" ? (
                                <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4 shrink-0" />
                              )}
                              {menuPending === "reactivate" ? "Reactivating..." : "Reactivate"}
                            </button>
                          )}
                          {patient.isPrivate ? (
                            canUnlock && (
                              <button
                                onClick={() => runMenuAction("unlock")}
                                disabled={menuPending !== null}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                {menuPending === "unlock" ? (
                                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                                ) : (
                                  <Unlock className="w-4 h-4 shrink-0" />
                                )}
                                {menuPending === "unlock" ? "Unlocking..." : "Unlock Record"}
                              </button>
                            )
                          ) : (
                            canLock && (
                              <button
                                onClick={() => runMenuAction("lock")}
                                disabled={menuPending !== null}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                {menuPending === "lock" ? (
                                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                                ) : (
                                  <Lock className="w-4 h-4 shrink-0" />
                                )}
                                {menuPending === "lock" ? "Locking..." : "Lock Record"}
                              </button>
                            )
                          )}
                          {flagTotalCount > 0 && (
                            <button
                              onClick={() => {
                                setShowMenu(false)
                                scrollToFlagHistory()
                              }}
                              disabled={menuPending !== null}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                              <Flag className="w-4 h-4 shrink-0" /> View Flag History
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 sm:p-2.5 rounded-xl border border-white/30 text-white hover:bg-white/10 transition-colors"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Body: sidebar + tabs                                       */}
            {/* ---------------------------------------------------------- */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              {/* Sidebar */}
              <div className="w-full lg:w-[280px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 overflow-y-auto px-5 sm:px-6 divide-y divide-gray-100">
                <SidebarItem
                  icon={<Calendar className="w-4 h-4" />}
                  iconBg="bg-[#E1F4E3]"
                  iconColor="text-emerald-600"
                  label="Appointment"
                  labelColor="text-emerald-600"
                >
                  {editingAppointment ? (
                    <div className="space-y-2">
                      <DateTimePicker
                        compact
                        value={newAppointmentDatetime ? new Date(newAppointmentDatetime).toISOString() : ""}
                        onChange={(iso) => setNewAppointmentDatetime(toLocalDatetimeLocal(new Date(iso)))}
                        minDate={getMinAppointmentDate()}
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleUpdateAppointment}
                          disabled={updateAppointment.isPending || !newAppointmentDatetime.trim()}
                          className="flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {updateAppointment.isPending ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => {
                            setEditingAppointment(false)
                            if (patient.appointmentDatetime) setNewAppointmentDatetime(toLocalDatetimeLocal(new Date(patient.appointmentDatetime)))
                            else setNewAppointmentDatetime("")
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {patient.appointmentDatetime ? (
                        <>
                          {new Date(patient.appointmentDatetime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          <br />
                          <span className="font-semibold text-emerald-600">
                            {new Date(patient.appointmentDatetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-400 font-medium">Not scheduled</span>
                      )}
                      <button
                        onClick={() => setEditingAppointment(true)}
                        className="ml-2 inline-flex align-middle p-1 rounded-md hover:bg-emerald-50 text-emerald-500 transition-colors"
                        title="Edit appointment"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </SidebarItem>
                
                <SidebarItem
                  icon={<Shield className="w-4 h-4" />}
                  iconBg="bg-[#CC3333]/10"
                  iconColor="text-[#CC3333]"
                  label="Eligibility"
                  labelColor="text-[#CC3333]"
                  action={
                    <button
                      onClick={() => setShowEligibilityCheck(true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#CC3333] bg-[#CC3333]/10 hover:bg-[#CC3333]/15 px-2.5 py-1 rounded-full transition-colors"
                    >
                      Check Eligibility
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  }
                >
                  {patient.eligibilityStatus === "eligible" ? (
                    <span className="text-emerald-600">Eligible</span>
                  ) : (
                    <span className="text-[#CC3333]">Not Eligible</span>
                  )}
                </SidebarItem>

                <SidebarItem
                  icon={<User className="w-4 h-4" />}
                  iconBg="bg-violet-50"
                  iconColor="text-violet-600"
                  label="Assigned To"
                  labelColor="text-violet-600"
                  action={
                    (!!vaList && (isAdmin || !patient.assignedUser)) ? (
                      <div className="relative">
                        <button
                          onClick={() => setShowAssignDropdown((v) => !v)}
                          disabled={assigning}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
                        >
                          {patient.assignedUser ? "Change Assignment" : "Assign Now"}
                          <ChevronRight className="w-3 h-3" />
                        </button>
                        {showAssignDropdown && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowAssignDropdown(false)} />
                            <div className="absolute left-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-20 max-h-52 overflow-y-auto">
                              {assignableVas.length === 0 && (
                                <p className="px-3 py-2 text-xs text-gray-400 italic">No VAs available</p>
                              )}
                              {assignableVas.map((va) => (
                                <button
                                  key={va.id}
                                  onClick={() => handleAssignTo(va.id)}
                                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-violet-50 transition-colors"
                                >
                                  {va.name}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : undefined
                  }
                >
                  {patient.assignedUser ? patient.assignedUser.name : <span className="text-gray-400">Unassigned</span>}
                  {assignFeedback && (
                    <p className={cn("text-[11px] mt-1 font-semibold", assignFeedback.type === "success" ? "text-emerald-700" : "text-[#CC3333]")}>
                      {assignFeedback.message}
                    </p>
                  )}
                </SidebarItem>

                <SidebarItem
                  icon={<ShieldCheck className="w-4 h-4" />}
                  iconBg="bg-[#E1F4E3]"
                  iconColor="text-emerald-600"
                  label="Insurance"
                  labelColor="text-emerald-600"
                >
                  {patient.insuranceProvider || <span className="text-gray-400">Not on file</span>}
                </SidebarItem>

                <SidebarItem
                  icon={<HelpCircle className="w-4 h-4" />}
                  iconBg="bg-amber-50"
                  iconColor="text-amber-500"
                  label="Status"
                  labelColor="text-amber-500"
                >
                  {patient.assignedUser ? (
                    <span className="capitalize">{patient.status}</span>
                  ) : (
                    <span className="text-amber-600">Unassigned</span>
                  )}
                </SidebarItem>

                <SidebarItem
                  icon={<Check className="w-4 h-4" />}
                  iconBg="bg-blue-50"
                  iconColor="text-blue-600"
                  label="Source"
                  labelColor="text-blue-600"
                >
                  <span className="capitalize">{patient.source || "Manual"}</span>
                </SidebarItem>

                <SidebarItem
                  icon={<Clock className="w-4 h-4" />}
                  iconBg="bg-gray-100"
                  iconColor="text-gray-500"
                  label="Last Updated"
                >
                  {timeAgo(patient.updatedAt)}
                </SidebarItem>
              </div>

              {/* Main content */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Tabs */}
                <div className="shrink-0 border-b border-gray-100 px-4 sm:px-8 flex gap-4 sm:gap-6 overflow-x-auto scrollbar-thin">
                  {TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "flex items-center gap-2 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors",
                        activeTab === tab.key
                          ? "border-emerald-600 text-emerald-700"
                          : "border-transparent text-gray-500 hover:text-gray-700",
                      )}
                    >
                      {tab.icon}
                      {tab.label}
                      {tab.key === "flags" && flagTotalCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#CC3333]/15 text-[#CC3333] text-[10px] font-bold">
                          {flagTotalCount}
                        </span>
                      )}
                      {tab.key === "messages" && smsUnreadCount > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#036638]/15 text-[#036638] text-[10px] font-bold">
                          {smsUnreadCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-track-gray-50 scrollbar-thumb-gray-300">
                  <div className="p-5 sm:p-7 space-y-5">
                    {/* ---------------------------------------------------- */}
                    {/* Overview tab: SOP + Checklist + Summary              */}
                    {/* ---------------------------------------------------- */}
                    {activeTab === "overview" && (
                      <>
                        {(latestFlag ?? patient.flagReason) && patient.isFlagged && (
                          <div
                            className={cn(
                              "rounded-2xl border p-4 sm:p-5",
                              isAdminFlag(latestFlag)
                                ? "border-amber-200 bg-amber-50/70 border-l-4 border-l-amber-400"
                                : latestFlag?.type === "positive"
                                  ? "border-emerald-200 bg-emerald-50/70 border-l-4 border-l-emerald-400"
                                  : "border-[#CC3333]/30 bg-[#CC3333]/10 border-l-4 border-l-[#CC3333]/60",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                              <p
                                className={cn(
                                  "text-xs font-bold flex items-center gap-1.5",
                                  isAdminFlag(latestFlag)
                                    ? "text-amber-700"
                                    : latestFlag?.type === "positive"
                                      ? "text-emerald-700"
                                      : "text-[#CC3333]",
                                )}
                              >
                                {isAdminFlag(latestFlag) ? (
                                  <>
                                    <Shield className="w-3.5 h-3.5" fill="#F59E0B" /> Admin Flag
                                  </>
                                ) : (
                                  <>
                                    <Flag className="w-3.5 h-3.5" fill="#CC3333" /> Flag Reason
                                  </>
                                )}
                              </p>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    "px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap",
                                    isAdminFlag(latestFlag)
                                      ? "bg-amber-100 text-amber-700"
                                      : latestFlag?.type === "positive"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-[#CC3333]/15 text-[#CC3333]",
                                  )}
                                >
                                  {flagTotalCount} flag{flagTotalCount !== 1 ? "s" : ""}
                                </span>
                                {flagStageCount > 0 && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-white/70 text-gray-600 border border-gray-200 rounded-full whitespace-nowrap">
                                    {flagStageCount} on this stage
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className={cn("text-sm", isAdminFlag(latestFlag) ? "text-amber-900" : latestFlag?.type === "positive" ? "text-emerald-900" : "text-[#A32727]")}>
                              {latestFlag?.reason ?? patient.flagReason}
                            </p>
                            <p
                              className={cn(
                                "text-[11px] mt-1",
                                isAdminFlag(latestFlag)
                                  ? "text-amber-700/70"
                                  : latestFlag?.type === "positive"
                                    ? "text-emerald-700/70"
                                    : "text-[#CC3333]/70",
                              )}
                            >
                              by {latestFlag?.flaggedByUser?.name ?? patient.flaggedByUser?.name}
                              {isAdminFlag(latestFlag) ? " (Admin)" : ""} -{" "}
                              {timeAgo((latestFlag?.createdAt ?? patient.flaggedAt?.toString()) || "")}
                            </p>
                            {flagTotalCount > 1 && (
                              <button
                                onClick={scrollToFlagHistory}
                                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 underline underline-offset-2 hover:text-gray-900 transition-colors"
                              >
                                View All Flags ({flagTotalCount}) <ChevronDown className="w-3 h-3" />
                              </button>
                            )}
                            {isAdmin &&
                              (clearingFlagId === "current" ? (
                                <FlagClearForm
                                  clearReason={clearReason}
                                  setClearReason={setClearReason}
                                  isPending={clearFlag.isPending}
                                  onClear={handleClearFlag}
                                  onCancel={() => {
                                    setClearingFlagId(null)
                                    setClearReason("")
                                  }}
                                />
                              ) : (
                                <button
                                  onClick={() => setClearingFlagId("current")}
                                  className={cn(
                                    "mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
                                    isAdminFlag(latestFlag)
                                      ? "text-amber-700 border-amber-200 bg-white/70 hover:bg-amber-50"
                                      : latestFlag?.type === "positive"
                                        ? "text-emerald-700 border-emerald-200 bg-white/70 hover:bg-emerald-50"
                                        : "text-[#CC3333] border-[#CC3333]/30 bg-white/70 hover:bg-[#CC3333]/10",
                                  )}
                                >
                                  <FlagOff className="w-3.5 h-3.5" /> Clear Flag
                                </button>
                              ))}
                          </div>
                        )}

                        {/* Pipeline stepper */}
                        <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-emerald-50/40 p-4 sm:p-5">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Pipeline Stage
                            </h4>
                            <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-[#036638]/10 text-[#036638] border border-[#036638]/20 whitespace-nowrap">
                              {currentStageIdx >= 0 ? `Stage ${currentStageIdx + 1} of ${stageOrder.length}` : stageLabels[patient.stage]}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 transition-all duration-500 rounded-full"
                              style={{ width: currentStageIdx >= 0 ? `${((currentStageIdx + 1) / stageOrder.length) * 100}%` : "0%" }}
                            />
                          </div>
                          <div className="flex w-full overflow-x-auto gap-1 p-1.5 pt-2">
                            {stageOrder.map((stage, idx) => {
                              const color = getStageColor(stage)
                              const isComplete = idx < currentStageIdx
                              const isCurrent = stage === patient.stage
                              const isNext = idx === currentStageIdx + 1
                              const isClickable = isCurrent ? false : isComplete ? true : isNext ? allComplete : false
                              return (
                                <div key={stage} className="relative flex-1 min-w-[64px] flex flex-col items-center">
                                  {idx > 0 && (
                                    <div
                                      className={cn(
                                        "absolute top-[22px] left-[calc(-50%+18px)] right-[calc(50%-18px)] h-[3px] rounded-full transition-colors duration-500",
                                        idx <= currentStageIdx ? color.connector : "bg-gray-200",
                                      )}
                                    />
                                  )}
                                  <button
                                    onClick={() => isClickable && handleMoveStage(stage)}
                                    disabled={!isClickable || movingStage !== null}
                                    className={cn(
                                      "relative w-full flex flex-col items-center gap-1.5 py-1 px-1 rounded-xl transition-all",
                                      isCurrent && "cursor-default",
                                      (!isClickable || movingStage !== null) && !isCurrent && "opacity-50 cursor-not-allowed",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300",
                                        isCurrent && cn(color.circle, color.ring, "text-white scale-110"),
                                        isComplete && !isCurrent && cn(color.circle, "text-white"),
                                        !isCurrent && !isComplete && "bg-white border-gray-200 text-gray-400",
                                      )}
                                    >
                                      {movingStage === stage ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : isComplete ? (
                                        <Check className="w-4 h-4" />
                                      ) : (
                                        idx + 1
                                      )}
                                    </span>
                                    <span className={cn("text-[10px] mt-2 font-semibold text-center leading-tight", isCurrent ? color.label : "text-gray-500")}>
                                      {stageLabels[stage]}
                                    </span>
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* SOP card with progress ring */}
                        <div className="relative rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 sm:p-5 overflow-hidden">
                          <ClipboardList className="absolute -right-3 -bottom-3 w-28 h-28 text-amber-500/10 pointer-events-none" />
                        
                          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-8">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-amber-800 uppercase tracking-wide flex items-center gap-2 mb-3">
                                <Zap className="w-5 h-5 text-amber-500" /> Standard Operating Procedure
                              </h4>
                              <ul className="space-y-2.5">
                                {sopItems.map((sop, idx) => {
                                  const done = idx < completedItems
                                  return (
                                    <li key={idx} className="flex items-center gap-2.5 text-sm font-medium">
                                      {done ? (
                                        <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                                          <Check className="w-3 h-3 text-white" />
                                        </span>
                                      ) : (
                                        <Circle className="w-5 h-5 text-amber-300 shrink-0" />
                                      )}
                                      <span className={done ? "text-amber-900/60 line-through" : "text-amber-900"}>{sop}</span>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                            {totalItems > 0 && (
                              <ProgressRing percent={progress} label={`${completedItems} / ${totalItems}`} sublabel="Completed" />
                            )}
                          </div>
                        </div>

                        {/* Checklist card */}
                        <div className="relative rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5 overflow-hidden">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold text-blue-800 uppercase tracking-wide flex items-center gap-2">
                              <CheckCheck className="w-5 h-5 text-blue-600" />
                              Checklist
                            </h4>
                            {(checklistPending.size > 0 || bulkPending) && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                          </div>
                          {currentStageItems.length > 0 ? (
                            <>
                              {totalItems > 0 && (
                                <div className="mb-4">
                                  <div className="flex justify-between text-xs text-gray-600 mb-1 font-medium">
                                    <span>{completedItems} / {totalItems} Completed</span>
                                    <span className="text-blue-700">{progress}%</span>
                                  </div>
                                  <div className="w-full h-2.5 bg-white/80 rounded-full overflow-hidden border border-blue-200">
                                    <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-2 mb-4">
                                <Button size="sm" variant="outline" onClick={() => handleBulkChecklist(true)} disabled={checklistBusy}
                                  className="text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-[#009650] hover:text-white bg-white font-semibold">
                                  <CheckCheck className="w-3.5 h-3.5" /> Check All
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleBulkChecklist(false)} disabled={checklistBusy}
                                  className="text-xs gap-1.5 border-gray-300 text-gray-600 hover:bg-[#9C460C] hover:text-white bg-white font-semibold">
                                  <ListX className="w-3.5 h-3.5" /> Uncheck All
                                </Button>
                              </div>
                              <div className="space-y-1.5">
                                {currentStageItems.map((item) => {
                                  const checked = !!currentState[item.id]
                                  const isItemPending = checklistPending.has(item.id)
                                  return (
                                    <label
                                      key={item.id}
                                      className={cn(
                                        "flex items-start gap-3 p-3 rounded-xl bg-white hover:shadow-md transition-all cursor-pointer border border-gray-100",
                                        isItemPending && "opacity-70",
                                        checked && "bg-blue-50/50 border-blue-200",
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={isItemPending}
                                        onChange={() => {
                                          if (isItemPending) return
                                          setChecklistPending((prev) => new Set(prev).add(item.id))
                                          toggleChecklist.mutate(
                                            { id: patient.id, itemId: item.id, checked: !checked },
                                            {
                                              onSettled: () =>
                                                setChecklistPending((prev) => {
                                                  const next = new Set(prev)
                                                  next.delete(item.id)
                                                  return next
                                                }),
                                            },
                                          )
                                        }}
                                        className="mt-0.5 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={cn("text-sm font-semibold", checked ? "text-gray-400 line-through" : "text-gray-800")}>
                                            {item.label}
                                          </span>
                                          <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full", item.status === "required" ? "bg-[#CC3333]/15 text-[#CC3333]" : "bg-blue-100 text-blue-700")}>
                                            {item.status}
                                          </span>
                                          {isItemPending && <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />}
                                        </div>
                                        {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                                      </div>
                                    </label>
                                  )
                                })}
                              </div>
                            </>
                          ) : (
                            <div className="relative flex items-center gap-3 rounded-xl bg-white/80 border border-blue-100 px-4 py-4 overflow-hidden">
                              <ClipboardList className="absolute -right-2 -bottom-2 w-16 h-16 text-blue-500/10 pointer-events-none" />
                              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                <Check className="w-4 h-4 text-blue-600" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-blue-700">No checklist required</p>
                                <p className="text-xs text-gray-500 mt-0.5">Great! There are no checklist items for this patient.</p>
                              </div>
                            </div>
                          )}
                        </div>

                    

                        {isAdmin && showCancelInput && (
                          <div className="space-y-2 bg-[#CC3333]/10 p-3 rounded-xl border border-[#CC3333]/30">
                            <Textarea placeholder="Cancellation reason..." value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="text-sm min-h-[70px]" />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleCancelPatient} disabled={updateStatus.isPending} className="bg-[#CC3333] hover:bg-[#B02A2A] text-white text-xs gap-1.5">
                                {updateStatus.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                {updateStatus.isPending ? "Cancelling..." : "Confirm"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setShowCancelInput(false)} className="text-xs">Cancel</Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* ---------------------------------------------------- */}
                    {/* Contact & Payment tab                                */}
                    {/* ---------------------------------------------------- */}
                    {activeTab === "contact" && (
                      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-4 gap-2">
                          <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Contact & Payment</h4>
                          <Button size="sm" onClick={onSaveContact} disabled={isSubmitting}
                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold shadow shrink-0">
                            {isSubmitting ? "Saving..." : "Save"}
                          </Button>
                        </div>

                        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                          <img
                            src={getAvatarUrl(patient)}
                            alt={patient.name}
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(patient.name || "Patient")}`
                            }}
                            className="w-12 h-12 rounded-full object-cover border border-gray-200 shrink-0 bg-gray-50"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate">{patient.name}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {patient.phone && (
                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                  <Phone className="w-3 h-3" /> {patient.phone}
                                </span>
                              )}
                              {patient.email && (
                                <span className="flex items-center gap-1 text-xs text-gray-500 truncate">
                                  <Mail className="w-3 h-3" /> {patient.email}
                                </span>
                              )}
                              {!patient.phone && !patient.email && (
                                <span className="text-xs text-gray-400 italic">No contact info on file</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className={contactLabelClass(!!errors.firstName)}>First Name <span className="text-[#CC3333]">*</span></label>
                            <input {...register("firstName")} aria-invalid={!!errors.firstName} className={contactInputClass(!!errors.firstName)} />
                            {errors.firstName && <p className="text-[11px] text-[#CC3333] mt-1">{errors.firstName.message}</p>}
                          </div>
                          <div>
                            <label className={contactLabelClass(!!errors.lastName)}>Last Name <span className="text-[#CC3333]">*</span></label>
                            <input {...register("lastName")} aria-invalid={!!errors.lastName} className={contactInputClass(!!errors.lastName)} />
                            {errors.lastName && <p className="text-[11px] text-[#CC3333] mt-1">{errors.lastName.message}</p>}
                          </div>
                          <div>
                            <label className={contactLabelClass(false)}>Location</label>
                            <LocationCombobox
                              value={watch("location") ?? ""}
                              onChange={(v) => setValue("location", v, { shouldValidate: true, shouldDirty: true })}
                              placeholder="Search city & state..."
                              className={contactInputClass(false)}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Date of Birth</label>
                            <DatePicker
                              value={watch("dateOfBirth") ?? ""}
                              onChange={(iso) => setValue("dateOfBirth", iso, { shouldValidate: true })}
                              maxDate={getMaxDobDate()}
                              placeholder="Select date of birth"
                            />
                            {errors.dateOfBirth && <p className="text-[11px] text-[#CC3333] mt-1">{errors.dateOfBirth.message}</p>}
                            <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-1">
                              <Info className="w-3 h-3 shrink-0" />
                              DOB must be realistic — patient must be at least 15 years old
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <label className={cn(contactLabelClass(!!errors.phone), "mb-0")}>Phone <span className="text-[#CC3333]">*</span></label>
                              <span className="text-[10px] font-medium text-gray-400 shrink-0">(555) 123-4567</span>
                            </div>
                            <div className="relative">
                              <span
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#036638] border-r border-gray-200 pr-2 pointer-events-none select-none"
                                aria-hidden
                              >
                                +1
                              </span>
                              <input
                                type="tel"
                                inputMode="tel"
                                value={watch("phone") ?? ""}
                                onChange={(e) =>
                                  setValue("phone", formatUsPhone(e.target.value), {
                                    shouldValidate: true,
                                    shouldDirty: true,
                                  })
                                }
                                aria-invalid={!!errors.phone}
                                placeholder="(555) 123-4567"
                                className={cn(contactInputClass(!!errors.phone), "pl-12")}
                              />
                            </div>
                            {errors.phone && <p className="text-[11px] text-[#CC3333] mt-1">{errors.phone.message}</p>}
                          </div>
                          <div>
                            <label className={contactLabelClass(false)}>Email</label>
                            <input
                              type="email"
                              // disabled={patient.email?.length}
                              title="Email can't be changed here"
                              placeholder="Entter Email Address"
                              {...register("email")}
                              className={cn(contactInputClass(false))}

                            />
                          
                          </div>
                          <div>
                            <label className={contactLabelClass(false)}>Copay Amount</label>
                            <input {...register("copayAmount")} className={contactInputClass(false)} />
                          </div>
                          <div>
                            <label className={contactLabelClass(false)}>Amount Paid</label>
                            <input {...register("amountPaid")} className={contactInputClass(false)} />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Payment Type</label>
                            <SelectOrOther value={paymentMethod} onChange={setPaymentMethod} otherMode={paymentMethodOther}
                              onOtherModeChange={setPaymentMethodOther} options={PAYMENT_METHOD_OPTIONS} placeholder="Select..." />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Insurance</label>
                            <SelectOrOther value={insuranceProvider} onChange={setInsuranceProvider} otherMode={insuranceProviderOther}
                              onOtherModeChange={setInsuranceProviderOther} options={INSURANCE_PROVIDER_OPTIONS} placeholder="Select..." />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Visit Status</label>
                            <Select value={visitStatus} onValueChange={setVisitStatus}>
                              <SelectTrigger className="w-full h-10 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-none focus:outline-none focus:ring-2 focus:ring-emerald-400/30 cursor-pointer">
                                <SelectValue placeholder="Select visit status..." />
                              </SelectTrigger>
                              <SelectContent>
                                {VISIT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ---------------------------------------------------- */}
                    {/* Eligibility Details tab                              */}
                    {/* ---------------------------------------------------- */}
                    {activeTab === "eligibility" && (
                      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm">
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-4">
                          <Shield className="w-5 h-5 text-emerald-600" /> Eligibility Details
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                          <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Payment Type</label>
                            <SelectOrOther value={paymentMethod} onChange={setPaymentMethod} otherMode={paymentMethodOther}
                              onOtherModeChange={setPaymentMethodOther} options={PAYMENT_METHOD_OPTIONS} placeholder="Select..." />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Insurance Company</label>
                            <SelectOrOther value={insuranceProvider} onChange={setInsuranceProvider} otherMode={insuranceProviderOther}
                              onOtherModeChange={setInsuranceProviderOther} options={INSURANCE_PROVIDER_OPTIONS} placeholder="Select..." />
                          </div>
                        </div>
                        <div className="flex items-center justify-between mb-4">
                          <span className={cn(
                            "px-2.5 py-1 text-xs font-bold rounded-full border shadow-sm shrink-0",
                            patient.eligibilityStatus === "eligible"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                              : "bg-[#CC3333]/15 text-[#CC3333] border-[#CC3333]/30",
                          )}>
                            {patient.eligibilityStatus === "eligible" ? "Eligible" : "Not Eligible"}
                          </span>
                          <button
                            onClick={() => setShowEligibilityCheck(true)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow transition-colors shrink-0"
                          >
                            Check Eligibility
                          </button>
                        </div>
                        {patient.eligibilityDetails?.vob && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {VOB_LABELS.map(([key, label]) => {
                              const value = patient.eligibilityDetails?.vob?.[key]
                              if (value === undefined || value === null) return null
                              return (
                                <div key={key} className="bg-gray-50 rounded-xl p-2.5">
                                  <p className="text-[10px] text-gray-500 font-medium">{label}</p>
                                  <p className="text-sm font-semibold text-gray-700">{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</p>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                  )}

                    {/* ---------------------------------------------------- */}
                    {/* Notes tab                                             */}
                    {/* ---------------------------------------------------- */}
                    {activeTab === "notes" && (
                      <>
                        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm">
                          <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-4">
                            <MessageSquare className="w-5 h-5 text-indigo-500" /> Notes
                          </h4>

                          {/* Composer */}
                          <div className="mb-4">
                            <Textarea
                              placeholder="Add an operational note..."
                              value={newNoteText}
                              onChange={(e) => setNewNoteText(e.target.value)}
                              className="text-sm min-h-[80px] rounded-xl border-gray-200 focus:ring-emerald-400/30"
                            />
                            <div className="mt-2 flex justify-end">
                              <Button
                                size="sm"
                                onClick={handleAddNote}
                                disabled={addNote.isPending || !newNoteText.trim()}
                                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold shadow"
                              >
                                {addNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                                Add Note
                              </Button>
                            </div>
                          </div>

                          {/* Note list (newest first) */}
                          <div className="space-y-3">
                            {(patient.patientNotes?.length ?? 0) > 0 ? (
                              patient.patientNotes!.map((note) => (
                                <div key={note.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[11px] font-semibold text-gray-700">
                                        {note.createdByUser?.name ?? "Unknown"}
                                      </span>
                                      {note.createdByUser?.role ? (
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                          {roleLabel(note.createdByUser.role)}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">
                                        {new Date(note.createdAt).toLocaleString()}
                                      </span>
                                      <button
                                        onClick={() => handleDeleteNote(note.id)}
                                        disabled={deletingNoteId === note.id}
                                        className="p-1 rounded-lg text-gray-400 hover:text-[#CC3333] hover:bg-[#CC3333]/10 transition-colors"
                                        title="Delete note"
                                      >
                                        {deletingNoteId === note.id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap break-words">{note.content}</p>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-gray-400 italic">No notes yet — add the first note above.</p>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* ---------------------------------------------------- */}
                    {/* Activity Log tab                                     */}
                    {/* ---------------------------------------------------- */}
                    {activeTab === "flags" && (
                      <div ref={flagHistoryRef} className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm scroll-mt-4">
                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                          <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                            <Flag className="w-5 h-5 text-[#CC3333]" /> Flag History
                          </h4>
                          <span className="ml-auto text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                            {flagTotalCount} flag{flagTotalCount !== 1 ? "s" : ""} | {flagStageCount} on this stage
                          </span>
                        </div>
                        <div className="space-y-3">
                          {flagHistory.length > 0 ? (
                            flagHistory.map((flag) => (
                              <div
                                key={flag.id}
                                className={cn(
                                  "rounded-xl border p-3",
                                  flag.type === "positive" ? "bg-emerald-50/60 border-emerald-200" : "bg-[#CC3333]/10 border-[#CC3333]/30",
                                )}
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={cn(
                                      "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                                      flag.type === "positive" ? "bg-emerald-100 text-emerald-700" : "bg-[#CC3333]/15 text-[#CC3333]",
                                    )}>
                                      {flag.type === "positive" ? "Positive" : "Alert"}
                                    </span>
                                    {isAdminFlag(flag) && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                        <Shield className="w-3 h-3" /> Admin Flag
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">
                                    {new Date(flag.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-800 mt-2">{flag.reason}</p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
                                  <span className="text-gray-500">
                                    by <span className="font-semibold text-gray-700">{flag.flaggedByUser?.name ?? "Unknown"}</span>
                                    {isAdminFlag(flag) && <span className="font-semibold text-amber-700"> (Admin)</span>}
                                    {stageLabels[flag.stage] ? ` | ${stageLabels[flag.stage]}` : ""}
                                  </span>
                                  {flag.clearedAt ? (
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-semibold rounded-full whitespace-nowrap">
                                      Cleared by {flag.clearedByUser?.name ?? "Unknown"}
                                      {flag.clearedByUser?.role ? ` (${roleLabel(flag.clearedByUser.role)})` : ""}
                                      {flag.clearedReason ? ` - ${flag.clearedReason}` : ""}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-[#CC3333]/15 text-[#CC3333] font-semibold rounded-full whitespace-nowrap">Open</span>
                                  )}
                                </div>
                                {isAdmin && !flag.clearedAt &&
                                  (clearingFlagId === flag.id ? (
                                    <FlagClearForm
                                      clearReason={clearReason}
                                      setClearReason={setClearReason}
                                      isPending={clearFlag.isPending}
                                      onClear={handleClearFlag}
                                      onCancel={() => {
                                        setClearingFlagId(null)
                                        setClearReason("")
                                      }}
                                    />
                                  ) : (
                                    <button
                                      onClick={() => setClearingFlagId(flag.id)}
                                      className={cn(
                                        "mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors",
                                        flag.type === "positive"
                                          ? "text-emerald-700 border-emerald-200 bg-white/70 hover:bg-emerald-50"
                                          : "text-[#CC3333] border-[#CC3333]/30 bg-white/70 hover:bg-[#CC3333]/10",
                                      )}
                                    >
                                      <FlagOff className="w-3.5 h-3.5" /> Clear Flag
                                    </button>
                                  ))}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-400 italic">No flags raised yet</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ---------------------------------------------------- */}
                    {/* Messages (SMS) tab                                   */}
                    {/* ---------------------------------------------------- */}
                    {activeTab === "messages" && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm min-h-full flex flex-col" style={{ height: "min(560px, 60vh)" }}>
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2 px-4 sm:px-5 pt-4 sm:pt-5">
                          <Phone className="w-5 h-5 text-[#036638]" /> Messages
                        </h4>
                        <MessageThread
                          conversation={smsConversation}
                          noPhoneNumber={!isLoadingConversation && !patient?.phone}
                          isLoadingConversation={isLoadingConversation}
                          isActive={activeTab === "messages"}
                          className="min-h-0"
                        />
                      </div>
                    )}

                    {activeTab === "activity" && (
                      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm min-h-full">
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-4">
                          <MessageSquare className="w-5 h-5 text-indigo-400" /> Activity Log
                        </h4>
                        <div className="space-y-1  overflow-y-auto pr-1">
                          {logData?.logs?.length ? logData.logs.map((log) => {
                            const meta = actionMeta(log.action)
                            const Icon = meta.icon
                            return (
                              <div key={log.id} className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-[#EBF7EC]/30 transition-colors">
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                  style={{ backgroundColor: `${meta.color}1A` }}
                                >
                                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-[#1A1B1E]">{log.author}</span>
                                    <span
                                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                      style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
                                    >
                                      {meta.label}
                                    </span>
                                    <span className="text-[11px] text-[#9CA3AF] ml-auto shrink-0 whitespace-nowrap">
                                      {fullDateTime(log.createdAt)}
                                    </span>
                                  </div>
                                  <p className="text-sm text-[#374151] mt-1 leading-relaxed">{log.message}</p>
                                </div>
                              </div>
                            )
                          }) : <p className="text-sm text-gray-400 italic px-2 py-4">No activity yet</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Footer                                                     */}
            {/* ---------------------------------------------------------- */}
            <div className="shrink-0 border-t border-gray-100 px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-[#6B7280] border border-gray-200 bg-white hover:bg-gray-50 hover:text-[#12141A] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-2.5">                {currentStageIdx < stageOrder.length - 1 && (
                  <button
                    onClick={() => handleMoveStage(stageOrder[currentStageIdx + 1])}
                    disabled={!allComplete || movingStage !== null}
                    className={cn(
                      "flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                      allComplete
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-sm shadow-emerald-500/30"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed",
                    )}
                    title={allComplete ? `Move to ${stageLabels[stageOrder[currentStageIdx + 1]]}` : "Tick every required item before moving forward."}
                  >
                    {movingStage ? (
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
          </>
        )}
        {assigning && (
          <div className="absolute inset-0 z-50 bg-white/80 flex items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            <span className="text-sm font-medium text-gray-700">Updating assignment...</span>
          </div>
        )}

        {/* Flag Popup */}
        {showFlagPopup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFlagPopup(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className={cn("px-5 py-4 flex items-center justify-between", isAdmin ? "bg-gradient-to-r from-emerald-600 to-teal-600" : "bg-[#CC3333]")}>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Flag className="w-5 h-5" fill="white" /> {isAdmin ? "Raise Admin Flag" : "Raise Flag"}
                </h3>
                <button onClick={() => setShowFlagPopup(false)} className="p-1 rounded-lg hover:bg-white/20 text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="flagType-desktop" value="positive" checked={newFlagType === "positive"}
                        onChange={(e) => setNewFlagType(e.target.value as "positive" | "negative")} className="w-4 h-4 accent-emerald-600" />
                      <span className="text-sm font-medium">Positive Note</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="flagType-desktop" value="negative" checked={newFlagType === "negative"}
                        onChange={(e) => setNewFlagType(e.target.value as "positive" | "negative")} className="w-4 h-4 accent-[#CC3333]" />
                      <span className="text-sm font-medium">Alert/Issue</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Reason</label>
                  <textarea value={newFlagReason} onChange={(e) => setNewFlagReason(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl min-h-[80px] focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setShowFlagPopup(false); setNewFlagReason(""); setNewFlagType("positive"); }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                  <button
                    onClick={async () => {
                      if (patient && newFlagReason.trim()) {
                        await flagPatient.mutateAsync({ id: patient.id, reason: newFlagReason, type: newFlagType })
                        setShowFlagPopup(false)
                        setNewFlagReason("")
                        setNewFlagType("positive")
                        toast.success("Flag raised")
                      }
                    }}
                    disabled={!newFlagReason.trim() || flagPatient.isPending}
                    className={cn(
                      "px-4 py-2 text-sm font-bold rounded-xl transition-colors flex items-center gap-2 shadow",
                      newFlagReason.trim() && !flagPatient.isPending
                        ? (isAdmin ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
                                   : "bg-gradient-to-r from-[#CC3333] to-[#B02A2A] hover:from-[#B02A2A] hover:to-[#962222] text-white")
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    {flagPatient.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" fill="currentColor" />}
                    Raise Flag
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Eligibility Check dialog (demo dummy fields) */}
        {patient && (
          <EligibilityCheckDialog
            patient={patient}
            open={showEligibilityCheck}
            onClose={() => setShowEligibilityCheck(false)}
          />
        )}
        </div>
      </div>
      </div>
      )}

      {/* Mobile & tablet — new responsive layout. Only mounted when the
          viewport is below desktop width — see the isDesktop effect above. */}
      {!isDesktop && (
      <div>
    <div className="fixed inset-0  top-[80px] z-100 flex items-center justify-center p-2 sm:p-4 lg:pl-[calc(var(--ech-sidebar-offset,8rem)*2)]">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !assigning && onClose()}
      />
      <div className="relative w-full max-w-[1400px] h-[95dvh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300">
        {isLoading || !patient ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            {isLoading ? (
              <div className="flex flex-col items-center gap-5">
                <div className="relative w-24 h-24 sm:w-28 sm:h-28">
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#65BD6C] border-r-[#036638] animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[#EBF7EC] to-[#036638]/10 blur-md animate-pulse" />
                  <div className="absolute inset-3 rounded-full border border-[#65BD6C]/30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img
                      src="/logo.png"
                      alt="Elevated Core Health"
                      className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
                    />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-[#1A1B1E]">Loading patient details...</p>
                  <p className="text-[11px] text-[#6B7280] mt-1">
                    Elevated <span className="text-[#036638] font-semibold">Core Health</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#65BD6C] rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-[#65BD6C] rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <span className="w-1.5 h-1.5 bg-[#65BD6C] rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Patient not found</p>
            )}
          </div>
        ) : (
          <>
            {/* Header — phone layout: avatar + name + actions on row 1, then
                contact details and status badges in their own full-width rows
                so nothing gets squeezed next to the avatar. */}
            <div className="shrink-0 relative bg-gradient-to-r from-[#036638] via-[#0a7a44] to-emerald-600 border-b border-white/10 px-3 py-3">
              <div className="absolute -right-10 -top-12 w-44 h-44 rounded-full bg-white/5 pointer-events-none" />
              <div className="absolute -right-2 -top-3 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />

              {/* Row 1 — avatar + name + action buttons */}
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {avatarError ? (
                    <div className="w-10 h-10 rounded-full shadow-sm shrink-0 bg-gradient-to-br from-lime-400 to-green-500 flex items-center justify-center text-white font-bold text-sm">
                      {getInitials(patient.name)}
                    </div>
                  ) : (
                    <img
                      src={getAvatarUrl(patient)}
                      onError={() => setAvatarError(true)}
                      alt={patient.name}
                      className="w-10 h-10 rounded-full object-cover shadow-sm shrink-0 bg-gray-50"
                    />
                  )}
                  <h2 className="text-lg font-bold text-white truncate">{patient.name}</h2>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setShowFlagPopup(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-white text-[11px] font-semibold text-[#036638] hover:bg-emerald-50 transition-colors shadow-sm"
                    title="Raise flag"
                  >
                    <Flag className="w-3.5 h-3.5 text-[#036638]" />
                    Flag
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowMenu((v) => !v)}
                      className="p-1.5 rounded-xl border border-white/30 text-white hover:bg-white/10 transition-colors"
                      title="More actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {showMenu && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => {
                            if (!menuPending) setShowMenu(false)
                          }}
                        />
                        <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-20">
                          {isAdmin && patient.status === "cancelled" && (
                            <button
                              onClick={() => runMenuAction("reactivate")}
                              disabled={menuPending !== null}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                              {menuPending === "reactivate" ? (
                                <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                              ) : (
                                <RefreshCw className="w-4 h-4 shrink-0" />
                              )}
                              {menuPending === "reactivate" ? "Reactivating..." : "Reactivate"}
                            </button>
                          )}
                          {patient.isPrivate ? (
                            canUnlock && (
                              <button
                                onClick={() => runMenuAction("unlock")}
                                disabled={menuPending !== null}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                {menuPending === "unlock" ? (
                                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                                ) : (
                                  <Unlock className="w-4 h-4 shrink-0" />
                                )}
                                {menuPending === "unlock" ? "Unlocking..." : "Unlock Record"}
                              </button>
                            )
                          ) : (
                            canLock && (
                              <button
                                onClick={() => runMenuAction("lock")}
                                disabled={menuPending !== null}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                {menuPending === "lock" ? (
                                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                                ) : (
                                  <Lock className="w-4 h-4 shrink-0" />
                                )}
                                {menuPending === "lock" ? "Locking..." : "Lock Record"}
                              </button>
                            )
                          )}
                          {flagTotalCount > 0 && (
                            <button
                              onClick={() => {
                                setShowMenu(false)
                                scrollToFlagHistory()
                              }}
                              disabled={menuPending !== null}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                              <Flag className="w-4 h-4 shrink-0" /> View Flag History
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 sm:p-2.5 rounded-xl border border-white/30 text-white hover:bg-white/10 transition-colors"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Row 2 — contact details, full-width so the email can never
                  get squeezed or clipped next to the avatar */}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/90">
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="w-3 h-3 shrink-0" />
                  {patient.source === "webhook" ? "Web" : "Manual"}
                </span>
                {patient.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-3 h-3 shrink-0" />
                    {patient.phone}
                  </span>
                )}
                {patient.email && (
                  <span className="flex items-center gap-1.5 min-w-0 max-w-full overflow-hidden">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{patient.email}</span>
                  </span>
                )}
              </div>

              {/* Row 3 — status badges, full-width wrap row */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/15 border border-white/25 text-white">
                  <CheckCircle className="w-3 h-3" />
                  {stageLabels[patient.stage]}
                </span>
                {patient.eligibilityStatus === "eligible" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/15 border border-white/25 text-white">
                    <CheckCircle className="w-3 h-3" />
                    Eligible
                  </span>
                ) : patient.eligibilityStatus === "not_eligible" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#CC3333]/30 border border-[#FF8A8A]/40 text-white">
                    <XCircle className="w-3 h-3" />
                    Not Eligible
                  </span>
                ) : null}
                {patient.isFlagged && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-400 border border-red-400 text-white">
                    <Flag className="w-3 h-3" fill="currentColor" />
                    Flagged
                  </span>
                )}
          {isExpired() && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-400/25 border border-amber-300/40 text-amber-50">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Appointment Date Expired
                      </span>
                    )}
                {patient.status !== "active" && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                      patient.status === "completed"
                        ? "bg-sky-400/25 border-sky-300/40 text-sky-50"
                        : "bg-[#CC3333]/30 border-[#FF8A8A]/40 text-white",
                    )}
                  >
                    {patient.status === "completed" ? "Completed" : "Cancelled"}
                  </span>
                )}
                {patient.isPrivate && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-400/25 border border-amber-300/40 text-amber-50">
                    <Lock className="w-3 h-3" />
                    Locked
                  </span>
                )}
              </div>
            </div>

            {/* Body: Stats Grid + Tabs + Content */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
              
                     {/* Stats Grid (Mobile/Tablet View) */}
          <div className="shrink-0 px-2.5 py-1.5 border-b border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2.5">
              {/* Card 1: Appointment */}
              <div className="relative bg-white rounded-xl border border-gray-100 p-1.5 shadow-sm">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="w-5 h-5 rounded-lg bg-[#E1F4E3] flex items-center justify-center text-emerald-600">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[8px] font-bold text-gray-400 uppercase">Appointment</span>
                </div>
                {editingAppointment ? (
                  <div className="space-y-1.5 mt-1">
                    <DateTimePicker compact minDate={getMinAppointmentDate()} value={newAppointmentDatetime ? new Date(newAppointmentDatetime).toISOString() : ""} onChange={(iso) => setNewAppointmentDatetime(toLocalDatetimeLocal(new Date(iso)))} />
                    <div className="flex gap-1">
                      <button onClick={handleUpdateAppointment} disabled={updateAppointment.isPending || !newAppointmentDatetime.trim()} className="flex-1 text-[10px] font-semibold py-1 rounded bg-emerald-600 text-white">Save</button>
                      <button onClick={() => { setEditingAppointment(false); if (patient.appointmentDatetime) setNewAppointmentDatetime(toLocalDatetimeLocal(new Date(patient.appointmentDatetime))); else setNewAppointmentDatetime(""); }} className="px-2 py-1 text-[10px] font-medium rounded border border-gray-200 text-gray-600">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex flex-col min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">
                        {patient.appointmentDatetime ? new Date(patient.appointmentDatetime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not scheduled"}
                      </p>
                      {patient.appointmentDatetime && <p className="text-[10px] font-medium text-emerald-600">{new Date(patient.appointmentDatetime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>}
                    </div>
                    <button onClick={() => setEditingAppointment(true)} className="p-1 rounded hover:bg-emerald-50 text-emerald-500"><Pencil className="w-3 h-3" /></button>
                  </div>
                )}
              </div>

              {/* Card 2: Eligibility */}
              <div className="relative bg-white rounded-xl border border-gray-100 p-1.5 shadow-sm">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="w-5 h-5 rounded-lg bg-[#CC3333]/10 flex items-center justify-center text-[#CC3333]">
                    <Shield className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[8px] font-bold text-gray-400 uppercase">Eligibility</span>
                </div>
                <p className={cn("text-xs font-bold", patient.eligibilityStatus === "eligible" ? "text-emerald-600" : "text-[#CC3333]")}>
                  {patient.eligibilityStatus === "eligible" ? "Eligible" : "Not Eligible"}
                </p>
                <button onClick={() => setShowEligibilityCheck(true)} className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold text-[#CC3333] bg-[#CC3333]/10 px-2 py-0.5 rounded-full hover:bg-[#CC3333]/15">
                  Check <ChevronRight className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* Card 3: Assigned To */}
              <div className="relative bg-white rounded-xl border border-gray-100 p-1.5 shadow-sm">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="w-5 h-5 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[8px] font-bold text-gray-400 uppercase">Assigned To</span>
                </div>
                <p className="text-xs font-bold text-gray-800 truncate">{patient.assignedUser ? patient.assignedUser.name : "Unassigned"}</p>
                {(!!vaList && (isAdmin || !patient.assignedUser)) && (
                  <div className="relative mt-1">
                    <button onClick={() => setShowAssignDropdown((v) => !v)} disabled={assigning} className="text-[9px] font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full flex items-center gap-0.5 hover:bg-violet-100">
                      {patient.assignedUser ? "Change" : "Assign"} <ChevronRight className="w-2.5 h-2.5" />
                    </button>
                    {showAssignDropdown && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowAssignDropdown(false)} />
                        <div className="absolute left-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20 max-h-40 overflow-y-auto">
                          {assignableVas.length === 0 && <p className="px-3 py-1.5 text-[10px] text-gray-400">No VAs available</p>}
                          {assignableVas.map((va) => (
                            <button key={va.id} onClick={() => handleAssignTo(va.id)} className="w-full text-left px-3 py-1.5 text-[10px] font-medium text-gray-700 hover:bg-violet-50">{va.name}</button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {assignFeedback && <p className={cn("text-[9px] mt-0.5 font-medium", assignFeedback.type === "success" ? "text-emerald-600" : "text-[#CC3333]")}>{assignFeedback.message}</p>}
              </div>

              {/* Card 4: Insurance */}
              <div className="relative bg-white rounded-xl border border-gray-100 p-1.5 shadow-sm">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="w-5 h-5 rounded-lg bg-[#E1F4E3] flex items-center justify-center text-emerald-600">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[8px] font-bold text-gray-400 uppercase">Insurance</span>
                </div>
                <p className="text-xs font-bold text-gray-800 truncate">{patient.insuranceProvider || "Not on file"}</p>
              </div>
            </div>
          </div>

              {/* Tabs */}
              <div className="shrink-0 border-b border-gray-100 px-4 sm:px-8 flex gap-4 sm:gap-6 overflow-x-auto scrollbar-thin">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "flex items-center gap-2 py-2.5 text-[11px] sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors",
                      activeTab === tab.key
                        ? "border-emerald-600 text-emerald-700"
                        : "border-transparent text-gray-500 hover:text-gray-700",
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.key === "flags" && flagTotalCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#CC3333]/15 text-[#CC3333] text-[10px] font-bold">
                        {flagTotalCount}
                      </span>
                    )}
                    {tab.key === "messages" && smsUnreadCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#036638]/15 text-[#036638] text-[10px] font-bold">
                        {smsUnreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Content Area */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-track-gray-50 scrollbar-thumb-gray-300 p-3 sm:p-5 space-y-3 bg-[#F9FAFB]">

                {/* OVERVIEW TAB */}
                {activeTab === "overview" && (
                  <>
                   {/* Checklist card */}
                        <div className="relative rounded-2xl border border-blue-100 bg-blue-50/60 p-3 sm:p-4 overflow-hidden">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-blue-800 uppercase tracking-wide flex items-center gap-2">
                              <CheckCheck className="w-5 h-5 text-blue-600" />
                              Checklist
                            </h4>
                            {(checklistPending.size > 0 || bulkPending) && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                          </div>
                          {currentStageItems.length > 0 ? (
                            <>
                              {totalItems > 0 && (
                                <div className="mb-4">
                                  <div className="flex justify-between text-xs text-gray-600 mb-1 font-medium">
                                    <span>{completedItems} / {totalItems} Completed</span>
                                    <span className="text-blue-700">{progress}%</span>
                                  </div>
                                  <div className="w-full h-2.5 bg-white/80 rounded-full overflow-hidden border border-blue-200">
                                    <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-2 mb-4">
                                <Button size="sm" variant="outline" onClick={() => handleBulkChecklist(true)} disabled={checklistBusy}
                                  className="text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-[#009650] hover:text-white bg-white font-semibold">
                                  <CheckCheck className="w-3.5 h-3.5" /> Check All
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleBulkChecklist(false)} disabled={checklistBusy}
                                  className="text-xs gap-1.5 border-gray-300 text-gray-600 hover:bg-[#9C460C] hover:text-white bg-white font-semibold">
                                  <ListX className="w-3.5 h-3.5" /> Uncheck All
                                </Button>
                              </div>
                              <div className="space-y-1.5">
                                {currentStageItems.map((item) => {
                                  const checked = !!currentState[item.id]
                                  const isItemPending = checklistPending.has(item.id)
                                  return (
                                    <label
                                      key={item.id}
                                      className={cn(
                                        "flex items-start gap-3 p-3 rounded-xl bg-white hover:shadow-md transition-all cursor-pointer border border-gray-100",
                                        isItemPending && "opacity-70",
                                        checked && "bg-blue-50/50 border-blue-200",
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={isItemPending}
                                        onChange={() => {
                                          if (isItemPending) return
                                          setChecklistPending((prev) => new Set(prev).add(item.id))
                                          toggleChecklist.mutate(
                                            { id: patient.id, itemId: item.id, checked: !checked },
                                            {
                                              onSettled: () =>
                                                setChecklistPending((prev) => {
                                                  const next = new Set(prev)
                                                  next.delete(item.id)
                                                  return next
                                                }),
                                            },
                                          )
                                        }}
                                        className="mt-0.5 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={cn("text-sm font-semibold", checked ? "text-gray-400 line-through" : "text-gray-800")}>
                                            {item.label}
                                          </span>
                                          <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full", item.status === "required" ? "bg-[#CC3333]/15 text-[#CC3333]" : "bg-blue-100 text-blue-700")}>
                                            {item.status}
                                          </span>
                                          {isItemPending && <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />}
                                        </div>
                                        {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                                      </div>
                                    </label>
                                  )
                                })}
                              </div>
                            </>
                          ) : (
                            <div className="relative flex items-center gap-3 rounded-xl bg-white/80 border border-blue-100 px-4 py-4 overflow-hidden">
                              <ClipboardList className="absolute -right-2 -bottom-2 w-16 h-16 text-blue-500/10 pointer-events-none" />
                              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                <Check className="w-4 h-4 text-blue-600" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-blue-700">No checklist required</p>
                                <p className="text-xs text-gray-500 mt-0.5">Great! There are no checklist items for this patient.</p>
                              </div>
                            </div>
                          )}
                        </div>
                    {(latestFlag ?? patient.flagReason) && patient.isFlagged && (
                      <div className={cn("rounded-2xl border p-4", isAdminFlag(latestFlag) ? "border-amber-200 bg-amber-50/70 border-l-4 border-l-amber-400" : latestFlag?.type === "positive" ? "border-emerald-200 bg-emerald-50/70 border-l-4 border-l-emerald-400" : "border-[#CC3333]/30 bg-[#CC3333]/10 border-l-4 border-l-[#CC3333]/60")}>
                        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                          <p className={cn("text-xs font-bold flex items-center gap-1.5", isAdminFlag(latestFlag) ? "text-amber-700" : latestFlag?.type === "positive" ? "text-emerald-700" : "text-[#CC3333]")}>
                            {isAdminFlag(latestFlag) ? <><Shield className="w-3.5 h-3.5" fill="#F59E0B" /> Admin Flag</> : <><Flag className="w-3.5 h-3.5" fill="#CC3333" /> Flag Reason</>}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap", isAdminFlag(latestFlag) ? "bg-amber-100 text-amber-700" : latestFlag?.type === "positive" ? "bg-emerald-100 text-emerald-700" : "bg-[#CC3333]/15 text-[#CC3333]")}>
                              {flagTotalCount} flag{flagTotalCount !== 1 ? "s" : ""}
                            </span>
                            {flagStageCount > 0 && <span className="px-2 py-0.5 text-[10px] font-bold bg-white/70 text-gray-600 border border-gray-200 rounded-full whitespace-nowrap">{flagStageCount} on this stage</span>}
                          </div>
                        </div>
                        <p className={cn("text-sm", isAdminFlag(latestFlag) ? "text-amber-900" : latestFlag?.type === "positive" ? "text-emerald-900" : "text-[#A32727]")}>
                          {latestFlag?.reason ?? patient.flagReason}
                        </p>
                        <p className={cn("text-[11px] mt-1", isAdminFlag(latestFlag) ? "text-amber-700/70" : latestFlag?.type === "positive" ? "text-emerald-700/70" : "text-[#CC3333]/70")}>
                          by {latestFlag?.flaggedByUser?.name ?? patient.flaggedByUser?.name} {isAdminFlag(latestFlag) ? "(Admin)" : ""} - {timeAgo((latestFlag?.createdAt ?? patient.flaggedAt?.toString()) || "")}
                        </p>
                        {flagTotalCount > 1 && <button onClick={scrollToFlagHistory} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 underline underline-offset-2 hover:text-gray-900">View All Flags ({flagTotalCount}) <ChevronDown className="w-3 h-3" /></button>}
                        {isAdmin && (clearingFlagId === "current" ? (
                          <FlagClearForm clearReason={clearReason} setClearReason={setClearReason} isPending={clearFlag.isPending} onClear={handleClearFlag} onCancel={() => { setClearingFlagId(null); setClearReason(""); }} />
                        ) : (
                          <button onClick={() => setClearingFlagId("current")} className={cn("mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors", isAdminFlag(latestFlag) ? "text-amber-700 border-amber-200 bg-white/70 hover:bg-amber-50" : latestFlag?.type === "positive" ? "text-emerald-700 border-emerald-200 bg-white/70 hover:bg-emerald-50" : "text-[#CC3333] border-[#CC3333]/30 bg-white/70 hover:bg-[#CC3333]/10")}>
                            <FlagOff className="w-3.5 h-3.5" /> Clear Flag
                          </button>
                        ))}


                       
                      </div>
                    )}

                    {/* SOP */}
                    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 overflow-hidden">
                      <ClipboardList className="absolute -right-3 -bottom-3 w-28 h-28 text-amber-500/10 pointer-events-none" />
                      <div className="relative flex flex-col sm:flex-row items-start gap-6">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-3">
                            <Zap className="w-5 h-5 text-amber-500" />
                            <h4 className="text-sm font-bold text-amber-800 uppercase tracking-wide">Standard Operating Procedure</h4>
                            <div className="ml-auto text-[10px] font-bold text-amber-700 bg-white/60 px-2.5 py-0.5 rounded-full border border-amber-200">
                              {completedItems} / {totalItems} Completed
                            </div>
                          </div>
                          <ul className="space-y-2.5">
                            {sopItems.map((sop, idx) => {
                              const done = idx < completedItems
                              return (
                                <li key={idx} className="flex items-center gap-2.5 text-sm font-medium">
                                  {done ? (
                                    <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0"><Check className="w-3 h-3 text-white" /></span>
                                  ) : (
                                    <Circle className="w-5 h-5 text-amber-300 shrink-0" />
                                  )}
                                  <span className={done ? "text-amber-900/60 line-through" : "text-amber-900"}>{sop}</span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                        {totalItems > 0 && <ProgressRing percent={progress} label={`${completedItems} / ${totalItems}`} sublabel="Completed" />}
                      </div>
                    </div>

                    {/* Status, Source, Last Updated Cards */}
                    <div className="space-y-3">
                      <div className="bg-amber-50/80 rounded-xl border border-amber-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-start sm:items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                            <HelpCircle className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Status</p>
                            <p className="text-sm font-bold text-amber-900">{patient.assignedUser ? patient.assignedUser.name : "Unassigned"}</p>
                          </div>
                        </div>
                        {!patient.assignedUser && vaList && vaList.length > 0 && (
                          <button onClick={() => setShowAssignDropdown(true)} className="flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-100 px-3 py-1.5 rounded-full hover:bg-orange-200 transition-colors ml-auto sm:ml-0 shrink-0">
                            Assign Now <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="bg-purple-50/80 rounded-xl border border-purple-200 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-purple-700 shrink-0">
                            <Globe className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Source</p>
                            <p className="text-sm font-bold text-purple-900 capitalize">{patient.source || "Manual"}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50/80 rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 shrink-0">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Last Updated</p>
                            <p className="text-sm font-bold text-gray-800">{timeAgo(patient.updatedAt)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Contact & Payment Info Card */}
                    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                      <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                            <Info className="w-3.5 h-3.5" />
                          </div>
                          Contact & Payment Information
                        </h4>
                        <button onClick={() => setActiveTab("contact")} className="flex items-center gap-1.5 text-xs font-semibold text-green-600 border border-green-200 bg-green-50 px-3 py-1 rounded-lg hover:bg-green-100 transition-colors">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4">
                        <div className="flex items-center gap-3">
                          <User className="w-4 h-4 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-gray-500">Name</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{patient.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-gray-500">Phone</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{patient.phone || "-"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-gray-500">Email</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{patient.email || "-"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Globe className="w-4 h-4 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium text-gray-500">Location</p>
                            <p className="text-sm font-medium text-gray-800 truncate">{patient.location || "-"}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {isAdmin && showCancelInput && (
                      <div className="space-y-2 bg-[#CC3333]/10 p-3 rounded-xl border border-[#CC3333]/30">
                        <Textarea placeholder="Cancellation reason..." value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="text-sm min-h-[70px]" />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleCancelPatient} disabled={updateStatus.isPending} className="bg-[#CC3333] hover:bg-[#B02A2A] text-white text-xs gap-1.5">
                            {updateStatus.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {updateStatus.isPending ? "Cancelling..." : "Confirm"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowCancelInput(false)} className="text-xs">Cancel</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* CONTACT TAB */}
                {activeTab === "contact" && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 gap-2">
                      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Contact & Payment</h4>
                      <Button size="sm" onClick={onSaveContact} disabled={isSubmitting} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold shadow shrink-0">
                        {isSubmitting ? "Saving..." : "Save"}
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                      <img src={getAvatarUrl(patient)} alt={patient.name} onError={(e) => { ;(e.currentTarget as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(patient.name || "Patient")}` }} className="w-12 h-12 rounded-full object-cover border border-gray-200 shrink-0 bg-gray-50" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{patient.name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {patient.phone && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" /> {patient.phone}</span>}
                          {patient.email && <span className="flex items-center gap-1 text-xs text-gray-500 truncate"><Mail className="w-3 h-3" /> {patient.email}</span>}
                          {!patient.phone && !patient.email && <span className="text-xs text-gray-400 italic">No contact info on file</span>}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={contactLabelClass(!!errors.firstName)}>First Name <span className="text-[#CC3333]">*</span></label>
                        <input {...register("firstName")} aria-invalid={!!errors.firstName} className={contactInputClass(!!errors.firstName)} />
                        {errors.firstName && <p className="text-[11px] text-[#CC3333] mt-1">{errors.firstName.message}</p>}
                      </div>
                      <div>
                        <label className={contactLabelClass(!!errors.lastName)}>Last Name <span className="text-[#CC3333]">*</span></label>
                        <input {...register("lastName")} aria-invalid={!!errors.lastName} className={contactInputClass(!!errors.lastName)} />
                        {errors.lastName && <p className="text-[11px] text-[#CC3333] mt-1">{errors.lastName.message}</p>}
                      </div>
                      <div><label className={contactLabelClass(false)}>Location</label><LocationCombobox value={watch("location") ?? ""} onChange={(v) => setValue("location", v, { shouldValidate: true, shouldDirty: true })} placeholder="Search city & state..." className={contactInputClass(false)} /></div>
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label className={cn(contactLabelClass(!!errors.phone), "mb-0")}>Phone <span className="text-[#CC3333]">*</span></label>
                          <span className="text-[10px] font-medium text-gray-400 shrink-0">(555) 123-4567</span>
                        </div>
                        <div className="relative">
                          <span
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#036638] border-r border-gray-200 pr-2 pointer-events-none select-none"
                            aria-hidden
                          >
                            +1
                          </span>
                          <input
                            type="tel"
                            inputMode="tel"
                            value={watch("phone") ?? ""}
                            onChange={(e) =>
                              setValue("phone", formatUsPhone(e.target.value), {
                                shouldValidate: true,
                                shouldDirty: true,
                              })
                            }
                            aria-invalid={!!errors.phone}
                            placeholder="(555) 123-4567"
                            className={cn(contactInputClass(!!errors.phone), "pl-12")}
                          />
                        </div>
                        {errors.phone && <p className="text-[11px] text-[#CC3333] mt-1">{errors.phone.message}</p>}
                      </div>
                      <div><label className={contactLabelClass(false)}>Email</label><input type="email" readOnly title="Email can't be changed here" {...register("email")}  className={cn(contactInputClass(false), "bg-gray-50 text-gray-500 cursor-not-allowed")} /></div>
                      <div><label className={contactLabelClass(false)}>Copay Amount</label><input {...register("copayAmount")} type="number" className={contactInputClass(false)} /></div>
                      <div><label className={contactLabelClass(false)}>Amount Paid</label><input {...register("amountPaid")} type="number" className={contactInputClass(false)} /></div>
                      <div><label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Payment Type</label><SelectOrOther value={paymentMethod} onChange={setPaymentMethod} otherMode={paymentMethodOther} onOtherModeChange={setPaymentMethodOther} options={PAYMENT_METHOD_OPTIONS} placeholder="Select..." /></div>
                      <div><label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Insurance</label><SelectOrOther value={insuranceProvider} onChange={setInsuranceProvider} otherMode={insuranceProviderOther} onOtherModeChange={setInsuranceProviderOther} options={INSURANCE_PROVIDER_OPTIONS} placeholder="Select..." /></div>
                      <div><label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Visit Status</label><Select value={visitStatus} onValueChange={setVisitStatus}><SelectTrigger className="w-full h-10 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-none focus:outline-none focus:ring-2 focus:ring-emerald-400/30 cursor-pointer"><SelectValue placeholder="Select visit status..." /></SelectTrigger><SelectContent>{VISIT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                  </div>
                )}

                {/* ELIGIBILITY TAB */}
                {activeTab === "eligibility" && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-4"><Shield className="w-5 h-5 text-emerald-600" /> Eligibility Details</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Payment Type</label><SelectOrOther value={paymentMethod} onChange={setPaymentMethod} otherMode={paymentMethodOther} onOtherModeChange={setPaymentMethodOther} options={PAYMENT_METHOD_OPTIONS} placeholder="Select..." /></div>
                      <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Insurance Company</label><SelectOrOther value={insuranceProvider} onChange={setInsuranceProvider} otherMode={insuranceProviderOther} onOtherModeChange={setInsuranceProviderOther} options={INSURANCE_PROVIDER_OPTIONS} placeholder="Select..." /></div>
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <span className={cn("px-2.5 py-1 text-xs font-bold rounded-full border shadow-sm shrink-0", patient.eligibilityStatus === "eligible" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-[#CC3333]/15 text-[#CC3333] border-[#CC3333]/30")}>
                        {patient.eligibilityStatus === "eligible" ? "Eligible" : "Not Eligible"}
                      </span>
                      <button onClick={() => setShowEligibilityCheck(true)} className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow transition-colors shrink-0">Check Eligibility</button>
                    </div>
                    {patient.eligibilityDetails?.vob && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {VOB_LABELS.map(([key, label]) => {
                          const value = patient.eligibilityDetails?.vob?.[key]
                          if (value === undefined || value === null) return null
                          return (<div key={key} className="bg-gray-50 rounded-xl p-2.5"><p className="text-[10px] text-gray-500 font-medium">{label}</p><p className="text-sm font-semibold text-gray-700">{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</p></div>)
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* NOTES TAB */}
                {activeTab === "notes" && (
                  <>
                    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4 text-indigo-500" /> Notes</h4>
                      <div className="mb-3">
                        <Textarea placeholder="Add an operational note..." value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} className="text-sm min-h-[70px] rounded-xl border-gray-200 focus:ring-emerald-400/30" />
                        <div className="mt-2 flex justify-end">
                          <Button
                            size="sm"
                            onClick={handleAddNote}
                            disabled={addNote.isPending || !newNoteText.trim()}
                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold shadow"
                          >
                            {addNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                            Add Note
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        {(patient.patientNotes?.length ?? 0) > 0 ? (
                          patient.patientNotes!.map((note) => (
                            <div key={note.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-2.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-semibold text-gray-700">{note.createdByUser?.name ?? "Unknown"}</span>
                                  {note.createdByUser?.role ? <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{roleLabel(note.createdByUser.role)}</span> : null}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">{new Date(note.createdAt).toLocaleString()}</span>
                                  <button onClick={() => handleDeleteNote(note.id)} disabled={deletingNoteId === note.id} className="p-1 rounded-lg text-gray-400 hover:text-[#CC3333] hover:bg-[#CC3333]/10 transition-colors" title="Delete note">
                                    {deletingNoteId === note.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-gray-800 mt-1.5 whitespace-pre-wrap break-words">{note.content}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-gray-400 italic">No notes yet — add the first note above.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* ACTIVITY TAB */}
                {activeTab === "flags" && (
                  <div ref={flagHistoryRef} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm scroll-mt-4">
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2"><Flag className="w-5 h-5 text-[#CC3333]" /> Flag History</h4>
                      <span className="ml-auto text-[11px] font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap">{flagTotalCount} flag{flagTotalCount !== 1 ? "s" : ""} | {flagStageCount} on this stage</span>
                    </div>
                    <div className="space-y-3">
                      {flagHistory.length > 0 ? (flagHistory.map((flag) => (
                        <div key={flag.id} className={cn("rounded-xl border p-3", flag.type === "positive" ? "bg-emerald-50/60 border-emerald-200" : "bg-[#CC3333]/10 border-[#CC3333]/30")}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", flag.type === "positive" ? "bg-emerald-100 text-emerald-700" : "bg-[#CC3333]/15 text-[#CC3333]")}>{flag.type === "positive" ? "Positive" : "Alert"}</span>
                              {isAdminFlag(flag) && (<span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"><Shield className="w-3 h-3" /> Admin Flag</span>)}
                            </div>
                            <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">{new Date(flag.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-gray-800 mt-2">{flag.reason}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]">
                            <span className="text-gray-500">by <span className="font-semibold text-gray-700">{flag.flaggedByUser?.name ?? "Unknown"}</span>{isAdminFlag(flag) && <span className="font-semibold text-amber-700"> (Admin)</span>}{stageLabels[flag.stage] ? ` | ${stageLabels[flag.stage]}` : ""}</span>
                            {flag.clearedAt ? (<span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-semibold rounded-full whitespace-nowrap">Cleared by {flag.clearedByUser?.name ?? "Unknown"}{flag.clearedByUser?.role ? ` (${roleLabel(flag.clearedByUser.role)})` : ""}{flag.clearedReason ? ` - ${flag.clearedReason}` : ""}</span>) : (<span className="px-2 py-0.5 bg-[#CC3333]/15 text-[#CC3333] font-semibold rounded-full whitespace-nowrap">Open</span>)}
                          </div>
                          {isAdmin && !flag.clearedAt && (clearingFlagId === flag.id ? (<FlagClearForm clearReason={clearReason} setClearReason={setClearReason} isPending={clearFlag.isPending} onClear={handleClearFlag} onCancel={() => { setClearingFlagId(null); setClearReason(""); }} />) : (<button onClick={() => setClearingFlagId(flag.id)} className={cn("mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors", flag.type === "positive" ? "text-emerald-700 border-emerald-200 bg-white/70 hover:bg-emerald-50" : "text-[#CC3333] border-[#CC3333]/30 bg-white/70 hover:bg-[#CC3333]/10")}><FlagOff className="w-3.5 h-3.5" /> Clear Flag</button>))}
                        </div>
                      ))) : (<p className="text-sm text-gray-400 italic">No flags raised yet</p>)}
                    </div>
                  </div>
                )}

                {activeTab === "messages" && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col" style={{ height: "min(520px, 65vh)" }}>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2 px-4 pt-4"><Phone className="w-5 h-5 text-[#036638]" /> Messages</h4>
                    <MessageThread
                      conversation={smsConversation}
                      noPhoneNumber={!isLoadingConversation && !patient?.phone}
                      isLoadingConversation={isLoadingConversation}
                      isActive={activeTab === "messages"}
                      compact
                      className="min-h-0"
                    />
                  </div>
                )}

                {activeTab === "activity" && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-4"><MessageSquare className="w-5 h-5 text-indigo-400" /> Activity Log</h4>
                    <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
                      {logData?.logs?.length ? logData.logs.map((log) => {
                        const meta = actionMeta(log.action)
                        const Icon = meta.icon
                        return (
                          <div key={log.id} className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-[#EBF7EC]/30 transition-colors">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: `${meta.color}1A` }}><Icon className="w-4 h-4" style={{ color: meta.color }} /></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm text-[#1A1B1E]">{log.author}</span><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}>{meta.label}</span><span className="text-[11px] text-[#9CA3AF] ml-auto shrink-0 whitespace-nowrap">{fullDateTime(log.createdAt)}</span></div>
                              <p className="text-sm text-[#374151] mt-1 leading-relaxed">{log.message}</p>
                            </div>
                          </div>
                        )
                      }) : <p className="text-sm text-gray-400 italic px-2 py-4">No activity yet</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-gray-100 px-4 sm:px-8 py-4 bg-white flex items-center justify-between gap-3">
              <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-[#6B7280] border border-gray-200 bg-white hover:bg-gray-50 hover:text-[#12141A] transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-2.5">
                {currentStageIdx < stageOrder.length - 1 && (
                  <button onClick={() => handleMoveStage(stageOrder[currentStageIdx + 1])} disabled={!allComplete || movingStage !== null} className={cn("flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all", allComplete ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-sm shadow-emerald-500/30" : "bg-gray-100 text-gray-400 cursor-not-allowed")} title={allComplete ? `Move to ${stageLabels[stageOrder[currentStageIdx + 1]]}` : "Tick every required item before moving forward."}>
                    {movingStage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Moving...
                      </>
                    ) : (
                      <>
                        Move Next <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        {assigning && (
          <div className="absolute inset-0 z-50 bg-white/80 flex items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            <span className="text-sm font-medium text-gray-700">Updating assignment...</span>
          </div>
        )}

        {/* Flag Popup */}
        {showFlagPopup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFlagPopup(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className={cn("px-5 py-4 flex items-center justify-between", isAdmin ? "bg-gradient-to-r from-emerald-600 to-teal-600" : "bg-[#CC3333]")}>
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Flag className="w-5 h-5" fill="white" /> {isAdmin ? "Raise Admin Flag" : "Raise Flag"}</h3>
                <button onClick={() => setShowFlagPopup(false)} className="p-1 rounded-lg hover:bg-white/20 text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="flagType-mobile" value="positive" checked={newFlagType === "positive"} onChange={(e) => setNewFlagType(e.target.value as "positive" | "negative")} className="w-4 h-4 accent-emerald-600" />
                      <span className="text-sm font-medium">Positive Note</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="flagType-mobile" value="negative" checked={newFlagType === "negative"} onChange={(e) => setNewFlagType(e.target.value as "positive" | "negative")} className="w-4 h-4 accent-[#CC3333]" />
                      <span className="text-sm font-medium">Alert/Issue</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Reason</label>
                  <textarea value={newFlagReason} onChange={(e) => setNewFlagReason(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl min-h-[80px] focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setShowFlagPopup(false); setNewFlagReason(""); setNewFlagType("positive"); }} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                  <button onClick={async () => { if (patient && newFlagReason.trim()) { await flagPatient.mutateAsync({ id: patient.id, reason: newFlagReason, type: newFlagType }); setShowFlagPopup(false); setNewFlagReason(""); setNewFlagType("positive"); toast.success("Flag raised"); } }} disabled={!newFlagReason.trim() || flagPatient.isPending} className={cn("px-4 py-2 text-sm font-bold rounded-xl transition-colors flex items-center gap-2 shadow", newFlagReason.trim() && !flagPatient.isPending ? (isAdmin ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white" : "bg-gradient-to-r from-[#CC3333] to-[#B02A2A] hover:from-[#B02A2A] hover:to-[#962222] text-white") : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
                    {flagPatient.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" fill="currentColor" />} Raise Flag
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {patient && (
          <EligibilityCheckDialog patient={patient} open={showEligibilityCheck} onClose={() => setShowEligibilityCheck(false)} />
        )}
      </div>
    </div>
      </div>
      )}
    </>
  )
}
