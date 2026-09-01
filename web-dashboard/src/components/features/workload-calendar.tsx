"use client"

import { useMemo, useRef, useState, useCallback, useEffect } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import listPlugin from "@fullcalendar/list"
import interactionPlugin from "@fullcalendar/interaction"
import type { EventContentArg, EventClickArg } from "@fullcalendar/core"
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Download,
  AlertTriangle,
  RefreshCw,
  Clock,
  User as UserIcon,
  CalendarClock,
  CalendarRange,
  List as ListIcon,
  X,
} from "lucide-react"
import { addDays, endOfWeek, format, startOfWeek } from "date-fns"
import { usePatients, useListVas } from "@/hooks/query/usePatients"
import { useStageMeta } from "@/hooks/query/useStages"
import { formatPatientDate, formatPatientTime, toPatientNaiveIsoString, toPatientWallClock } from "@/lib/clinic-time"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLogExport } from "@/hooks/query/useReporting"
import { useAuth } from "@/hooks/auth/useAuth"
import { PatientModal } from "@/components/features/patient-modal"
import { WorkloadTimeGrid, type TimeGridEvent } from "@/components/features/workload-time-grid"
import type { Patient } from "@/types"
import { cn } from "@/lib/utils"
import { isAdminOrAbove } from "@/lib/roles"

type ViewKey = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek"

const VIEW_OPTIONS: { key: ViewKey; label: string; icon: typeof CalendarDays }[] = [
  { key: "dayGridMonth", label: "Month", icon: CalendarDays },
  { key: "timeGridWeek", label: "Week", icon: CalendarRange },
  { key: "timeGridDay", label: "Day", icon: CalendarClock },
  { key: "listWeek", label: "List", icon: ListIcon },
]

// Deterministic brand-consistent palette, one color per pipeline stage (by order).
const STAGE_PALETTE = [
  { bg: "#036638", text: "#ffffff" },
  { bg: "#0F9B8E", text: "#ffffff" },
  { bg: "#65BD6C", text: "#0B3D1E" },
  { bg: "#D97706", text: "#ffffff" },
  { bg: "#7C3AED", text: "#ffffff" },
  { bg: "#DB2777", text: "#ffffff" },
  { bg: "#4B5563", text: "#ffffff" },
]

function stageColor(stage: string, order: string[]) {
  const idx = order.indexOf(stage)
  return STAGE_PALETTE[(idx >= 0 ? idx : 0) % STAGE_PALETTE.length]
}

// Distinct palette for VA badges, kept separate from stage colors so the two
// signals (stage vs. assigned VA) never get visually confused.
const VA_BADGE_COLORS = ["#2563EB", "#DB2777", "#D97706", "#0891B2", "#7C3AED", "#059669"]

function vaBadgeColor(vaId: string | null | undefined, vaList: { id: string }[] | undefined) {
  if (!vaId) return { bg: "#9CA3AF", text: "#ffffff" }
  const idx = vaList?.findIndex((v) => v.id === vaId) ?? -1
  return { bg: VA_BADGE_COLORS[(idx >= 0 ? idx : 0) % VA_BADGE_COLORS.length], text: "#ffffff" }
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows.map((r) => r.map(csvEscape).join(",")).join("\n")
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function WorkloadCalendar() {
  const { user } = useAuth()
  const isAdmin = isAdminOrAbove(user?.role)
  const { data: patients, isLoading, isError, error, refetch, isFetching } = usePatients()
  const { data: vaList } = useListVas()
  const { order: stageOrder, labels: stageLabels } = useStageMeta()
  const logExport = useLogExport()

  const calendarRef = useRef<FullCalendar | null>(null)
  const [activeView, setActiveView] = useState<ViewKey>("dayGridMonth")
  const [titleText, setTitleText] = useState("")
  const [search, setSearch] = useState("")
  const [vaFilter, setVaFilter] = useState<string>("")
  const [stageFilter, setStageFilter] = useState<string>("")
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  // Week and Day are our own component rather than FullCalendar's timeGrid (see
  // workload-time-grid.tsx), so they need their own navigation anchor.
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const isCustomGrid = activeView === "timeGridWeek" || activeView === "timeGridDay"
  const gridMode = activeView === "timeGridDay" ? "day" : "week"

  const appointments = useMemo(() => {
    if (!patients) return []
    return patients.filter((p) => !!p.appointmentDatetime)
  }, [patients])

  const filtered = useMemo(() => {
    return appointments.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      if (vaFilter === "__unassigned__" && p.assignedTo) return false
      if (vaFilter && vaFilter !== "__unassigned__" && p.assignedTo !== vaFilter) return false
      if (stageFilter && p.stage !== stageFilter) return false
      return true
    })
  }, [appointments, search, vaFilter, stageFilter])

  const events = useMemo(
    () =>
      filtered.map((p) => {
        const color = stageColor(p.stage, stageOrder)
        const startInstant = new Date(p.appointmentDatetime as string)
        // A real appointment.endAt (from Klarity) is used verbatim when present;
        // otherwise fall back to a 30-minute default slot. Either way, the value
        // fed to FullCalendar below is converted to this patient's SOURCE
        // timezone (Klarity's configured zone for Klarity bookings, the
        // clinic's for everything else), not the viewer's — see
        // toPatientNaiveIsoString's doc comment for why.
        const endInstant = p.appointmentEndDatetime
          ? new Date(p.appointmentEndDatetime)
          : new Date(startInstant.getTime() + 30 * 60 * 1000)

        // FullCalendar buckets a timed event onto whichever calendar day its
        // "start" naive string falls on. A naive string carries no zone info,
        // so this comparison must be done on the SOURCE timezone's wall-clock
        // date parts — comparing raw UTC instants here would reintroduce the
        // exact wrong-day bug this fix exists to remove.
        const startDay = toPatientNaiveIsoString(p.bookingPlatform, startInstant).slice(0, 10)
        const endDay = toPatientNaiveIsoString(p.bookingPlatform, endInstant).slice(0, 10)

        return {
          id: p.id,
          title: p.name,
          start: toPatientNaiveIsoString(p.bookingPlatform, startInstant),
          // Only set end if it doesn't cross into the next local day —
          // FullCalendar would otherwise draw the event spanning both days.
          ...(startDay === endDay && { end: toPatientNaiveIsoString(p.bookingPlatform, endInstant) }),
          backgroundColor: color.bg,
          borderColor: color.bg,
          textColor: color.text,
          extendedProps: { patient: p },
        }
      }),
    [filtered, stageOrder],
  )

  const gridEvents = useMemo<TimeGridEvent[]>(
    () =>
      filtered.map((p) => {
        // Converted once here so every consumer downstream (hour bucketing,
        // "h:mm a" display) reads this patient's SOURCE-timezone wall-clock
        // hour, not whatever hour that UTC instant happens to be on the
        // viewer's own machine.
        const startDate = toPatientWallClock(p.bookingPlatform, new Date(p.appointmentDatetime as string))
        return {
          id: p.id,
          title: p.name,
          start: startDate,
          color: stageColor(p.stage, stageOrder),
          patient: p,
        }
      }),
    [filtered, stageOrder],
  )

  const stats = useMemo(() => {
    const unassigned = filtered.filter((p) => !p.assignedTo).length
    const flagged = filtered.filter((p) => p.isFlagged).length
    return { total: filtered.length, unassigned, flagged }
  }, [filtered])

  const syncTitle = useCallback(() => {
    const api = calendarRef.current?.getApi()
    if (api) setTitleText(api.view.title)
  }, [])

  // The custom grid derives its own title from the anchor date; FullCalendar
  // reports its title through `syncTitle` into `titleText`.
  const gridTitle = useMemo(() => {
    if (gridMode === "day") return format(anchorDate, "EEEE, MMMM d, yyyy")
    const start = startOfWeek(anchorDate, { weekStartsOn: 1 })
    const end = endOfWeek(anchorDate, { weekStartsOn: 1 })
    const sameMonth = start.getMonth() === end.getMonth()
    return sameMonth
      ? `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`
      : `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`
  }, [anchorDate, gridMode])

  const displayTitle = isCustomGrid ? gridTitle : titleText

  // Week steps by 7 days, Day by 1.
  const gridStep = gridMode === "day" ? 1 : 7

  const goToday = () => {
    if (isCustomGrid) {
      setAnchorDate(new Date())
      return
    }
    calendarRef.current?.getApi().today()
    syncTitle()
  }
  const goPrev = () => {
    if (isCustomGrid) {
      setAnchorDate((d) => addDays(d, -gridStep))
      return
    }
    calendarRef.current?.getApi().prev()
    syncTitle()
  }
  const goNext = () => {
    if (isCustomGrid) {
      setAnchorDate((d) => addDays(d, gridStep))
      return
    }
    calendarRef.current?.getApi().next()
    syncTitle()
  }
  const changeView = (view: ViewKey) => {
    if (view === activeView) return
    const goingToCustomGrid = view === "timeGridWeek" || view === "timeGridDay"

    // Switching in or out of the custom grid swaps which component is mounted, so hand
    // the current date across the boundary — otherwise the calendar silently jumps back
    // to today whenever FullCalendar remounts.
    if (goingToCustomGrid) {
      const api = calendarRef.current?.getApi()
      if (api) setAnchorDate(api.getDate())
      setActiveView(view)
      return
    }

    const carriedDate = isCustomGrid ? anchorDate : null
    setActiveView(view)
    // Defer so FullCalendar is mounted again before we call into its API.
    requestAnimationFrame(() => {
      const api = calendarRef.current?.getApi()
      if (!api) return
      if (carriedDate) api.gotoDate(carriedDate)
      api.changeView(view)
      syncTitle()
    })
  }

  // A month grid is unreadable at phone width — default to the agenda list
  // view there instead. Desktop/tablet keep the month view as before.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.matchMedia("(max-width: 640px)").matches) {
      changeView("listWeek")
    }
    // Only run once on mount — a user actively picking a view afterward
    // (e.g. rotating to landscape) shouldn't get overridden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEventClick = (arg: EventClickArg) => {
    setSelectedPatientId(arg.event.id)
  }

  const handleExport = () => {
    if (filtered.length === 0) return
    const rows: string[][] = [
      [
        "Patient Name",
        "Appointment Date",
        "Appointment Time",
        "Assigned VA",
        "Stage",
        "Status",
        "Phone",
        "Email",
        "Insurance Provider",
        "Eligibility",
      ],
    ]
    for (const p of filtered) {
      const dt = p.appointmentDatetime ? new Date(p.appointmentDatetime) : null
      rows.push([
        p.name,
        dt ? formatPatientDate(p.bookingPlatform, dt) : "",
        dt ? formatPatientTime(p.bookingPlatform, dt) : "",
        p.assignedUser?.name ?? "Unassigned",
        stageLabels[p.stage] ?? p.stage,
        p.status,
        p.phone ?? "",
        p.email ?? "",
        p.insuranceProvider ?? "",
        p.eligibilityStatus,
      ])
    }
    downloadCsv(`workload-appointments-${new Date().toISOString().slice(0, 10)}.csv`, rows)

    // task.md §15: report exports are audit events. Fire-and-forget — a
    // failed audit write must never block the download the user already has.
    const scope = [
      search ? `search: ${search}` : "",
      vaFilter === "__unassigned__"
        ? "VA: Unassigned"
        : vaFilter
          ? `VA: ${vaList?.find((v) => v.id === vaFilter)?.name ?? vaFilter}`
          : "",
      stageFilter ? `Stage: ${stageLabels[stageFilter] ?? stageFilter}` : "",
    ]
      .filter(Boolean)
      .join(" · ")

    logExport.mutate({
      reportType: "workload_appointments",
      label: "appointment",
      scope: scope || "all scheduled appointments",
      recordCount: filtered.length,
      format: "csv",
    })
  }

  const renderEventContent = (arg: EventContentArg) => {
    const patient = arg.event.extendedProps.patient as Patient
    const isMonth = arg.view.type === "dayGridMonth"
    // NOT formatPatientTime here on purpose: FullCalendar's own event.start is
    // already this patient's source-timezone wall-clock time, disguised as a
    // naive local value (see the `events` useMemo above /
    // toPatientNaiveIsoString) — re-converting it here would shift it twice.
    const time = arg.event.start
      ? new Date(arg.event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : ""

    if (isMonth) {
      const va = vaBadgeColor(patient.assignedTo, vaList)
      const vaInitial = patient.assignedUser?.name?.charAt(0).toUpperCase() ?? "?"
      const vaTitle = patient.assignedUser ? `Assigned to ${patient.assignedUser.name}` : "Unassigned"
      return (
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold truncate w-full"
          title={vaTitle}
        >
          <span className="opacity-90 shrink-0">{time}</span>
          <span className="truncate flex-1">{patient.name}</span>
          <span
            className="shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold leading-none"
            style={{ backgroundColor: va.bg, color: va.text }}
          >
            {vaInitial}
          </span>
          {patient.isFlagged && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
        </div>
      )
    }

    return (
      <div className="px-2 py-1 w-full">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold truncate">{patient.name}</span>
          {patient.isFlagged && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
        </div>
        <div className="text-[10px] opacity-90 flex items-center gap-1 mt-0.5">
          <Clock className="w-2.5 h-2.5" />
          {time}
        </div>
        <div className="text-[10px] opacity-90 flex items-center gap-1 mt-0.5 truncate">
          <UserIcon className="w-2.5 h-2.5 shrink-0" />
          {patient.assignedUser?.name ?? "Unassigned"}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 text-[#036638] animate-spin" />
      </div>
    )
  }

  // Same rule as the board: only blank the whole calendar when there's no
  // cached data to fall back on. A background refetch failing after some
  // other mutation invalidates the shared "patients" cache shouldn't wipe a
  // calendar that's already rendered.
  if (isError && !patients) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-500" />
        </div>
        <p className="text-sm text-red-600 font-medium">Failed to load workload calendar</p>
        <p className="text-xs text-[#6B7280]">
          {(error as any)?.response?.data?.message || (error as Error)?.message || "Something went wrong."}
        </p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#036638] text-white text-xs font-medium hover:bg-[#025030] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isError && patients && (
        <div className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs font-medium text-amber-800">
          Couldn&apos;t refresh the calendar just now - showing the last loaded data. It&apos;ll retry automatically.
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#1A1B1E] flex items-center gap-2">
            Workload Calendar
            {isFetching && <Loader2 className="w-3.5 h-3.5 text-[#65BD6C] animate-spin" />}
          </h1>
          <p className="text-xs sm:text-sm text-[#6B7280] mt-0.5">
            {isAdmin ? "Central scheduling dashboard - every appointment across the pipeline" : "Your team's scheduled appointments"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white border border-[#E5E7EB] text-xs flex-wrap">
            <span className="font-semibold text-[#036638]">{stats.total} shown</span>
            {stats.unassigned > 0 && (
              <span className="text-amber-600 font-medium">{stats.unassigned} unassigned</span>
            )}
            {stats.flagged > 0 && <span className="text-red-600 font-medium">{stats.flagged} flagged</span>}
          </div>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white text-xs font-medium text-[#1A1B1E] hover:border-[#65BD6C]/40 hover:bg-[#EBF7EC]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-2.5 sm:p-3 flex items-center justify-between flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={goPrev}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:bg-[#EBF7EC] hover:text-[#036638] transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goNext}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:bg-[#EBF7EC] hover:text-[#036638] transition-colors shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="h-8 px-2.5 sm:px-3 rounded-lg border border-[#E5E7EB] text-xs font-medium text-[#1A1B1E] hover:bg-[#EBF7EC] hover:border-[#65BD6C]/40 transition-colors shrink-0"
          >
            Today
          </button>
          <span className="text-xs sm:text-sm font-bold text-[#1A1B1E] ml-1 truncate">{displayTitle}</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 bg-[#F3F4F6] rounded-lg p-1">
          {VIEW_OPTIONS.map((v) => {
            const Icon = v.icon
            const active = activeView === v.key
            return (
              <button
                key={v.key}
                onClick={() => changeView(v.key)}
                title={v.label}
                className={cn(
                  "flex items-center gap-1.5 h-7 px-2 sm:px-2.5 rounded-md text-xs font-medium transition-colors",
                  active ? "bg-[#036638] text-white shadow-sm" : "text-[#6B7280] hover:text-[#1A1B1E]",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Search patient name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-8 rounded-lg border border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#036638]/30 focus:border-[#036638] transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1A1B1E]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex-1 sm:flex-none min-w-[110px]">
          <Select value={vaFilter} onValueChange={setVaFilter}>
            <SelectTrigger className="w-full h-9 rounded-lg border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] shadow-none focus:ring-2 focus:ring-[#036638]/25 hover:border-[#D1D5DB] cursor-pointer">
              <SelectValue placeholder="All VAs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All VAs</SelectItem>
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
              {vaList?.map((va) => (
                <SelectItem key={va.id} value={va.id}>
                  {va.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 sm:flex-none min-w-[110px]">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-full h-9 rounded-lg border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] shadow-none focus:ring-2 focus:ring-[#036638]/25 hover:border-[#D1D5DB] cursor-pointer">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Stages</SelectItem>
              {stageOrder.map((s) => (
                <SelectItem key={s} value={s}>
                  {stageLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(search || vaFilter || stageFilter) && (
          <button
            onClick={() => {
              setSearch("")
              setVaFilter("")
              setStageFilter("")
            }}
            className="text-xs font-medium text-[#036638] hover:underline"
          >
            Clear filters
          </button>
        )}

        {vaList && vaList.length > 0 && (
          <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto sm:ml-auto sm:pl-2">
            {vaList.map((va) => {
              const c = vaBadgeColor(va.id, vaList)
              return (
                <span key={va.id} className="flex items-center gap-1 text-[11px] text-[#6B7280]">
                  <span
                    className="w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold text-white shrink-0"
                    style={{ backgroundColor: c.bg }}
                  >
                    {va.name.charAt(0).toUpperCase()}
                  </span>
                  {va.name}
                </span>
              )
            })}
            <span className="flex items-center gap-1 text-[11px] text-[#6B7280]">
              <span className="w-3 h-3 rounded-full bg-[#9CA3AF] flex items-center justify-center text-[7px] font-bold text-white shrink-0">
                ?
              </span>
              Unassigned
            </span>
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="ech-calendar bg-white rounded-xl border border-[#E5E7EB] p-2 sm:p-3 overflow-x-auto">
        {filtered.length === 0 && appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <CalendarDays className="w-10 h-10 text-[#D1D5DB]" />
            <p className="text-sm text-[#6B7280] font-medium">No scheduled appointments yet</p>
            <p className="text-xs text-[#9CA3AF]">Appointments will appear here once patients have a scheduled date/time.</p>
          </div>
        ) : isCustomGrid ? (
          <WorkloadTimeGrid
            anchorDate={anchorDate}
            events={gridEvents}
            mode={gridMode}
            onEventClick={setSelectedPatientId}
          />
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={false}
            height="auto"
            events={events}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            dayMaxEvents={3}
            nowIndicator
            firstDay={1}
            datesSet={syncTitle}
            slotMinTime="06:00:00"
            slotMaxTime="20:00:00"
          />
        )}
      </div>

      <PatientModal
        patientId={selectedPatientId}
        open={!!selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
      />
    </div>
  )
}
