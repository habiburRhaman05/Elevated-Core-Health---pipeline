"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/auth/useAuth"
import { useDashboard } from "@/hooks/query/useDashboard"
import { usePatients } from "@/hooks/query/usePatients"
import { useAdminAnalytics } from "@/hooks/query/useAdmin"
import { SplashLoader } from "@/components/ui/splash-loader"
import { useClearFlag } from "@/hooks/query/usePatients"
import { ROUTES } from "@/constants"
import { useStageMeta } from "@/hooks/query/useStages"
import {
  Columns3,
  Users,
  Settings,
  AlertTriangle,
  Flag,
  Activity,
  BarChart3,
  User,
  Loader2,
  X,
  ArrowRight,
  CalendarDays,
  ShieldCheck,
  CheckCircle2,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { Patient } from "@/types"

export default function AdminDashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { data: summary } = useDashboard()
  const { data: patients } = usePatients()
  const { data: analytics } = useAdminAnalytics()
  const clearFlagMutation = useClearFlag()
  const { order: stageOrder, labels: stageLabels } = useStageMeta()

  const [clearingPatientId, setClearingPatientId] = useState<string | null>(null)
  const [clearReasonInput, setClearReasonInput] = useState("")

  const handleClearWithReason = async () => {
    if (!clearingPatientId || !clearReasonInput.trim()) return
    await clearFlagMutation.mutateAsync({ id: clearingPatientId, clearReason: clearReasonInput })
    setClearingPatientId(null)
    setClearReasonInput("")
  }

  const totalPatients = patients?.length || 0
  const flaggedPatients = patients?.filter((p) => p.isFlagged) || []
  const patientsByStage =
    patients?.reduce(
      (acc, p) => {
        acc[p.stage] = (acc[p.stage] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    ) || {}

  const maxStageCount = Math.max(...Object.values(patientsByStage), 1)

  const quickActions = [
    { label: "Board", icon: Columns3, href: ROUTES.ADMIN.BOARD, desc: "Full pipeline view", tint: "from-[#036638] to-emerald-600" },
    { label: "Users", icon: Users, href: ROUTES.ADMIN.USERS, desc: "Manage team accounts", tint: "from-[#3B82C4] to-sky-500" },
    { label: "Reporting", icon: BarChart3, href: ROUTES.ADMIN.REPORTING, desc: "Performance metrics", tint: "from-[#8B5CF6] to-violet-500" },
    { label: "Stage Settings", icon: Settings, href: ROUTES.ADMIN.STAGES, desc: "Manage stages & checklists", tint: "from-[#F2A93B] to-amber-500" },
    { label: "Profile", icon: User, href: ROUTES.ADMIN.PROFILE, desc: "Update your profile", tint: "from-[#E15C4E] to-rose-500" },
  ]

  const isLoading = !summary || !patients || !analytics

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  const statCards = [
    {
      label: "Total Patients",
      value: totalPatients,
      icon: Activity,
      iconBg: "bg-[#EBF7EC]",
      iconColor: "text-[#036638]",
      accent: "from-[#036638]/10 to-transparent",
      sub: "Across all pipeline stages",
    },
    {
      label: "Stale Cards",
      value: summary?.staleCount || 0,
      icon: AlertTriangle,
      iconBg: summary?.staleCount ? "bg-amber-50" : "bg-[#EBF7EC]",
      iconColor: summary?.staleCount ? "text-amber-500" : "text-[#036638]",
      accent: "from-amber-400/10 to-transparent",
      sub: "Not updated in 48+ hours",
    },
    {
      label: "Flagged",
      value: summary?.flaggedCount || 0,
      icon: Flag,
      iconBg: summary?.flaggedCount ? "bg-[#FEF2F2]" : "bg-[#EBF7EC]",
      iconColor: "text-[#036638]",
      accent: "from-[#65BD6C]/10 to-transparent",
      sub: "Awaiting your review",
    },
    {
      label: "Reconciled / Week",
      value: analytics?.reconciledThisWeek || 0,
      icon: CheckCircle2,
      iconBg: "bg-[#EBF7EC]",
      iconColor: "text-[#036638]",
      accent: "from-emerald-500/10 to-transparent",
      sub: "Closed out this week",
    },
  ]

  return (
    <>
      {isLoading && (
        <SplashLoader
          show={true}
          message=""
          subtitle="Setting up your workspace..."
        />
      )}
      <div className="relative z-10 space-y-6 max-w-[1600px] mx-auto pb-12">
        {/* - Hero header - */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#036638] via-[#0a7a44] to-emerald-600 px-6 py-6 sm:px-8 shadow-lg shadow-emerald-900/20">
          {/* Decorative blobs */}
          <div className="absolute -right-14 -top-20 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
          <div className="absolute -right-4 -top-8 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute right-32 -bottom-24 w-56 h-56 rounded-full bg-[#FBE7B2]/10 pointer-events-none" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 text-white text-[10px] font-bold uppercase tracking-widest ring-1 ring-white/20">
                  <ShieldCheck className="w-3 h-3" />
                  Admin Dashboard
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FBE7B2] text-[#7a5f14] text-[10px] font-bold">
                  <CalendarDays className="w-3 h-3" />
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {greeting}, {user?.name?.split(" ")[0]}
              </h1>
              <p className="text-emerald-50/85 text-sm mt-1">
                Here&apos;s your pipeline health at a glance
              </p>
            </div>
            <Button
              onClick={() => router.push(ROUTES.ADMIN.BOARD)}
              className="bg-white text-[#036638] hover:bg-emerald-50 font-semibold gap-2 rounded-xl h-10 px-5 shadow-lg shadow-black/10"
            >
              Open Board
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* - Status Cards - */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.label}
                className="group relative overflow-hidden bg-white rounded-2xl border border-[#E5E7EB] p-4 sm:p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                {/* Accent glow */}
                <div className={cn("absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300", card.accent)} />
                <div className="flex items-center gap-3.5 relative">
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-black/5", card.iconBg)}>
                    <Icon className={cn("w-5 h-5", card.iconColor)} strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-extrabold text-[#1A1B1E] leading-none tabular-nums">{card.value}</p>
                    <p className="text-xs font-medium text-[#6B7280] mt-1 truncate">{card.label}</p>
                  </div>
                </div>
                <p className="text-[11px] text-[#9CA3AF] mt-3 relative">{card.sub}</p>
              </div>
            )
          })}
        </div>

        {/* - Quick Navigation - */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-[#1A1B1E]">Quick Navigation</h2>
            <span className="h-px flex-1 bg-[#E5E7EB]/70" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.href}
                  onClick={() => router.push(action.href)}
                  className="group bg-white rounded-2xl border border-[#E5E7EB] p-4 text-left hover:border-[#65BD6C]/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                >
                  <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3 shadow-sm", action.tint)}>
                    <Icon className="w-5 h-5 text-white" strokeWidth={2} />
                  </div>
                  <p className="text-sm font-bold text-[#1A1B1E] flex items-center gap-1">
                    {action.label}
                    <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF] opacity-0 group-hover:opacity-100 group-hover:text-[#036638] -translate-x-1 group-hover:translate-x-0 transition-all" />
                  </p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{action.desc}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* - Flagged Patients - */}
        {flaggedPatients.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-[#1A1B1E]">Flagged Patients</h2>
              <span className="px-2 py-0.5 rounded-full bg-[#FEF2F2] text-red-600 text-[10px] font-bold">
                {flaggedPatients.length} awaiting review
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]/60 overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
              {flaggedPatients.map((patient) => (
                <FlaggedPatientRow
                  key={patient.id}
                  patient={patient}
                  onClearFlag={(id) => setClearingPatientId(id)}
                  isClearing={clearFlagMutation.isPending && clearingPatientId === patient.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* - Pipeline Overview + VA Load - */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-[#EBF7EC] flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-[#036638]" />
              </div>
              <h2 className="text-sm font-bold text-[#036638]">Pipeline Overview</h2>
              <span className="ml-auto text-[11px] text-[#6B7280]">{totalPatients} total</span>
            </div>
            <div className="space-y-3.5">
              {stageOrder.map((stage) => {
                const count = patientsByStage[stage] || 0
                const pct = Math.round((count / maxStageCount) * 100)
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[#374151] w-32 truncate shrink-0">
                      {stageLabels[stage]}
                    </span>
                    <div className="flex-1 h-2.5 bg-[#F3F4F6] rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-[#036638] to-[#65BD6C] rounded-full transition-all duration-500"
                        style={{ width: count > 0 ? `${Math.max(pct, 5)}%` : "0%" }}
                      />
                    </div>
                    <span className={cn(
                      "text-xs font-bold w-9 text-right tabular-nums shrink-0",
                      count > 0 ? "text-[#036638]" : "text-[#9CA3AF]",
                    )}>
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-[#EBF7EC] flex items-center justify-center">
                <Users className="w-4 h-4 text-[#036638]" />
              </div>
              <h2 className="text-sm font-bold text-[#036638]">VA Workload</h2>
            </div>
            {analytics?.vaLoad && analytics.vaLoad.length > 0 ? (
              <div className="space-y-4">
                {analytics.vaLoad.map((va) => {
                  const max = Math.max(...analytics.vaLoad.map((v) => v.patientCount), 1)
                  return (
                    <div key={va.id} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#036638] to-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                        <span className="text-xs font-bold text-white">
                          {va.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-semibold text-[#1A1B1E] truncate">{va.name}</p>
                          <p className="text-xs font-bold text-[#036638] tabular-nums">{va.patientCount}</p>
                        </div>
                        <div className="h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#036638] to-[#65BD6C] rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((va.patientCount / max) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 text-sm text-[#6B7280] italic">
                No VA data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clear Flag with Reason Modal */}
      {clearingPatientId && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 50 }}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" onClick={() => { setClearingPatientId(null); setClearReasonInput("") }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[#1A1B1E]">Clear Flag</h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Provide feedback to the VA who flagged this patient
                </p>
              </div>
              <button
                onClick={() => { setClearingPatientId(null); setClearReasonInput("") }}
                className="p-1 rounded-lg hover:bg-gray-100 text-[#6B7280]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <Textarea
              placeholder="Explain why you're clearing this flag (this will be emailed to the VA)..."
              value={clearReasonInput}
              onChange={(e) => setClearReasonInput(e.target.value)}
              className="text-sm min-h-[80px] mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setClearingPatientId(null); setClearReasonInput("") }}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleClearWithReason}
                disabled={!clearReasonInput.trim() || clearFlagMutation.isPending}
                className="bg-[#036638] hover:bg-[#02804A] text-white text-xs"
              >
                {clearFlagMutation.isPending ? "Clearing..." : "Confirm Clear"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function FlaggedPatientRow({
  patient,
  onClearFlag,
  isClearing,
}: {
  patient: Patient
  onClearFlag: (id: string) => void
  isClearing: boolean
}) {
  const { labels: stageLabels } = useStageMeta()
  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-[#F9FAFB] transition-colors">
      <div className="w-9 h-9 rounded-xl bg-[#FEF2F2] flex items-center justify-center shrink-0 ring-1 ring-red-100">
        <Flag className="w-4 h-4 text-[#036638]" fill="#036638" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1A1B1E] truncate">{patient.name}</p>
        <p className="text-xs text-[#6B7280] truncate mt-0.5">
          {patient.flagReason || "No reason given"}
          {patient.flaggedByUser && (
            <span className="text-[#9CA3AF]"> · flagged by {patient.flaggedByUser.name}</span>
          )}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 shrink-0 mr-1">
        <Clock className="w-3 h-3 text-[#9CA3AF]" />
        <span className="text-[11px] text-[#6B7280]">
          {patient.flaggedAt ? new Date(patient.flaggedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
        </span>
      </div>
      <span className="text-[10px] bg-[#EBF7EC] text-[#036638] px-2 py-1 rounded-full font-semibold capitalize shrink-0">
        {stageLabels[patient.stage] || patient.stage}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onClearFlag(patient.id)}
        disabled={isClearing}
        className="shrink-0 text-xs h-8 px-3 rounded-lg border-[#036638]/30 text-[#036638] hover:bg-[#036638] hover:text-white hover:border-[#036638]"
      >
        {isClearing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Clear Flag"}
      </Button>
    </div>
  )
}
