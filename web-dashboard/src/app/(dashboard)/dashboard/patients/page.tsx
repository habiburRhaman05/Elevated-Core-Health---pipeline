"use client"

import { useMemo, useState } from "react"
import { useAuth } from "@/hooks/auth/useAuth"
import { usePatients } from "@/hooks/query/usePatients"
import { useStageMeta } from "@/hooks/query/useStages"
import { PatientModal } from "@/components/features/patient-modal"
import { Loader2, Search, Users as UsersIcon, UserPlus, CheckCircle2, Phone, Mail, MapPin, Lock, Flag, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClinicDate } from "@/lib/clinic-time"

type Filter = "all" | "mine" | "added"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All Patients" },
  { value: "mine", label: "My Patients" },
  { value: "added", label: "Added by Me" },
]

export default function VAPatientsPage() {
  const { user } = useAuth()
  const { data: patients, isLoading } = usePatients()
  const { labels: stageLabels } = useStageMeta()
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = patients ?? []
    if (filter === "mine") {
      list = list.filter((p) => p.assignedTo === user?.id)
    } else if (filter === "added") {
      list = list.filter((p) => p.createdById === user?.id)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((p) => {
        const full = `${p.firstName ?? ""} ${p.lastName ?? ""} ${p.name}`.toLowerCase()
        const email = (p.email ?? "").toLowerCase()
        const phone = (p.phone ?? "").toLowerCase()
        return full.includes(q) || email.includes(q) || phone.includes(q)
      })
    }
    return list
  }, [patients, filter, search, user?.id])

  const counts = useMemo(() => {
    const list = patients ?? []
    return {
      all: list.length,
      mine: list.filter((p) => p.assignedTo === user?.id).length,
      added: list.filter((p) => p.createdById === user?.id).length,
    }
  }, [patients, user?.id])

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-[#036638]/10 flex items-center justify-center shrink-0">
          <UsersIcon className="w-5 h-5 text-[#036638]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[#1A1B1E]">Patients</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">Your patients and the unassigned pool</p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all",
              filter === f.value
                ? "bg-gradient-to-r from-[#036638] to-emerald-600 text-white border-transparent shadow-md shadow-emerald-500/25"
                : "bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#65BD6C]/50 hover:text-[#036638]",
            )}
          >
            {f.value === "mine" && <UserPlus className="w-3.5 h-3.5" />}
            {f.value === "added" && <CheckCircle2 className="w-3.5 h-3.5" />}
            {f.label}
            <span
              className={cn(
                "text-[10px] font-bold rounded-full px-1.5 py-0.5",
                filter === f.value ? "bg-white/20" : "bg-[#F3F4F6] text-[#9CA3AF]",
              )}
            >
              {counts[f.value]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
        <input
          type="text"
          placeholder="Search name, phone or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-4 rounded-xl border border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#036638]/30 focus:border-[#036638] transition-all"
        />
      </div>

      {/* Patient list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-[#036638] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-6 py-16 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#F3F4F6] flex items-center justify-center mb-3">
            <UsersIcon className="w-6 h-6 text-[#9CA3AF]" />
          </div>
          <p className="text-sm font-semibold text-[#1A1B1E]">No patients found</p>
          <p className="text-xs text-[#6B7280] mt-1">Try a different filter or search term</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((patient) => (
            <button
              key={patient.id}
              onClick={() => setSelectedPatientId(patient.id)}
              className="w-full text-left bg-white rounded-2xl border border-[#E5E7EB] p-4 hover:border-[#65BD6C]/50 hover:shadow-sm transition-all active:scale-[0.99]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#036638]/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-[#036638]">
                    {(patient.firstName || patient.name || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-bold text-[#1A1B1E] truncate">
                      {[patient.firstName, patient.lastName].filter(Boolean).join(" ") || patient.name}
                    </p>
                    {patient.isPrivate && (
                      <span title="Locked by assigned VA">
                        <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                      </span>
                    )}
                    {patient.isFlagged && (
                      <span title="Flagged for Donna">
                        <Flag className="w-3 h-3 text-[#036638] shrink-0" fill="#036638" />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                    {patient.phone && (
                      <span className="flex items-center gap-1 text-[11px] text-[#6B7280]">
                        <Phone className="w-3 h-3" /> {patient.phone}
                      </span>
                    )}
                    {patient.email && (
                      <span className="flex items-center gap-1 text-[11px] text-[#6B7280] truncate">
                        <Mail className="w-3 h-3 shrink-0" /> {patient.email}
                      </span>
                    )}
                    {patient.location && (
                      <span className="flex items-center gap-1 text-[11px] text-[#6B7280]">
                        <MapPin className="w-3 h-3" /> {patient.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#F3F4F6]">
                <span className="text-[11px] font-semibold bg-[#EBF7EC] text-[#036638] px-2 py-1 rounded-full">
                  {stageLabels[patient.stage] || patient.stage}
                </span>
                {patient.appointmentDatetime && (
                  <span className="flex items-center gap-1 text-[11px] text-[#6B7280]">
                    <Calendar className="w-3 h-3" />
                    {formatClinicDate(new Date(patient.appointmentDatetime), { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-[#9CA3AF]">
                  {patient.assignedUser?.name ? `Assigned to ${patient.assignedUser.name}` : "Unassigned"}
                </span>
              </div>
            </button>
          ))}
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
