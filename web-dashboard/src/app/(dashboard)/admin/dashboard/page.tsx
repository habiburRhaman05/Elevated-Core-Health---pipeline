"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/auth/useAuth"
import { useDashboard } from "@/hooks/query/useDashboard"
import { usePatients } from "@/hooks/query/usePatients"
import { useAdminAnalytics } from "@/hooks/query/useAdmin"
import { useClearFlag } from "@/hooks/query/usePatients"
import { ROUTES } from "@/constants"
import { STAGE_ORDER, STAGE_LABELS } from "@/types"
import {
  Columns3,
  Users,
  CheckSquare,
  AlertTriangle,
  Flag,
  Activity,
  BarChart3,
  User,
  Loader2,
  X,
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

  const [clearingPatientId, setClearingPatientId] = useState<string | null>(null)
  const [clearReasonInput, setClearReasonInput] = useState("")

  const handleClearWithReason = async () => {
    if (!clearingPatientId || !clearReasonInput.trim()) return
    await clearFlagMutation.mutateAsync({ id: clearingPatientId, clearReason: clearReasonInput })
    setClearingPatientId(null)
    setClearReasonInput("")
  }

  const totalPatients = patients?.length || 0
  const patientsByStage =
    patients?.reduce(
      (acc, p) => {
        acc[p.stage] = (acc[p.stage] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    ) || {}

  const quickActions = [
    { label: "Board", icon: Columns3, href: ROUTES.ADMIN.BOARD, desc: "Full pipeline view" },
    { label: "Users", icon: Users, href: ROUTES.ADMIN.USERS, desc: "Manage team accounts" },
    { label: "Checklist", icon: CheckSquare, href: ROUTES.ADMIN.CHECKLIST, desc: "Configure checklist items" },
    { label: "Profile", icon: User, href: ROUTES.ADMIN.PROFILE, desc: "Update your profile" },
  ]

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-xl font-bold text-[#1A1B1E]">
          Admin Dashboard
        </h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Welcome back, {user?.name?.split(" ")[0]}
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#E5E7EB] border-t-[3px] border-t-[#F2A93B] p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FFF0E5] flex items-center justify-center">
              <Activity className="w-5 h-5 text-[#E8792E]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1A1B1E]">{totalPatients}</p>
              <p className="text-xs text-[#6B7280]">Total Patients</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E7EB] border-t-[3px] border-t-[#E15C4E] p-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              summary?.staleCount && summary.staleCount > 0 ? "bg-[#FEFCE8]" : "bg-[#FFF0E5]",
            )}>
              <AlertTriangle className={cn(
                "w-5 h-5",
                summary?.staleCount && summary.staleCount > 0 ? "text-amber-500" : "text-[#E8792E]",
              )} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1A1B1E]">{summary?.staleCount || 0}</p>
              <p className="text-xs text-[#6B7280]">Stale</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E7EB] border-t-[3px] border-t-[#3B82C4] p-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              summary?.flaggedCount && summary.flaggedCount > 0 ? "bg-[#FEF2F2]" : "bg-[#FFF0E5]",
            )}>
              <Flag className={cn(
                "w-5 h-5",
                summary?.flaggedCount && summary.flaggedCount > 0 ? "text-[#E8792E]" : "text-[#E8792E]",
              )} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1A1B1E]">{summary?.flaggedCount || 0}</p>
              <p className="text-xs text-[#6B7280]">Flagged</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E7EB] border-t-[3px] border-t-[#3FA66E] p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FFF0E5] flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#E8792E]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#1A1B1E]">{analytics?.reconciledThisWeek || 0}</p>
              <p className="text-xs text-[#6B7280]">Reconciled/Week</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Nav */}
      <div>
        <h2 className="text-sm font-semibold text-[#1A1B1E] mb-3">Quick Navigation</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.href}
                onClick={() => router.push(action.href)}
                className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#F2994A]/40 hover:shadow-sm transition-all text-center"
              >
                <Icon className="w-6 h-6 text-[#E8792E] mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#1A1B1E]">{action.label}</p>
                <p className="text-xs text-[#6B7280] mt-0.5">{action.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Flagged Patients */}
      {patients && patients.filter((p) => p.isFlagged).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#1A1B1E] mb-3">Flagged Patients</h2>
          <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]/50 overflow-hidden">
            {patients
              .filter((p) => p.isFlagged)
              .map((patient) => (
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

      {/* Clear Flag with Reason Modal */}
      {clearingPatientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setClearingPatientId(null); setClearReasonInput("") }} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
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

      {/* Pipeline Overview + VA Load */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
          <h2 className="text-sm font-bold text-[#E8792E] mb-4">Pipeline Overview</h2>
          <div className="space-y-3">
            {STAGE_ORDER.map((stage) => {
              const count = patientsByStage[stage] || 0
              const maxCount = Math.max(...Object.values(patientsByStage), 1)
              const barWidth = (count / maxCount) * 100
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-xs text-[#6B7280] w-28 truncate shrink-0">
                    {STAGE_LABELS[stage]}
                  </span>
                  <div className="flex-1 h-5 bg-[#FFF0E5] rounded-full overflow-hidden">
                    {count > 0 && (
                      <div
                        className="h-full bg-[#E8792E] rounded-full transition-all"
                        style={{ width: `${Math.max(barWidth, 8)}%` }}
                      />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-[#1A1B1E] w-6 text-right">
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
          <h2 className="text-sm font-bold text-[#E8792E] mb-4">VA Workload</h2>
          {analytics?.vaLoad && analytics.vaLoad.length > 0 ? (
            <div className="space-y-3">
              {analytics.vaLoad.map((va) => (
                <div key={va.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FFF0E5] flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-[#E8792E]">
                      {va.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A1B1E] truncate">{va.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-[#FFF0E5] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#F2994A] rounded-full"
                          style={{
                            width: `${Math.min(
                              (va.patientCount / Math.max(...analytics.vaLoad.map((v) => v.patientCount), 1)) *
                                100,
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-[#1A1B1E]">
                        {va.patientCount}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6B7280] italic">No VA data available</p>
          )}
        </div>
      </div>
    </div>
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
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] flex items-center justify-center shrink-0">
        <Flag className="w-4 h-4 text-[#E8792E]" fill="#E8792E" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1A1B1E] truncate">{patient.name}</p>
        <p className="text-xs text-[#6B7280] truncate">
          {patient.flagReason || "No reason given"}
          {patient.flaggedByUser && ` — flagged by ${patient.flaggedByUser.name}`}
        </p>
      </div>
      <span className="text-[10px] bg-[#FFF0E5] text-[#E8792E] px-2 py-0.5 rounded font-medium capitalize shrink-0">
        {STAGE_LABELS[patient.stage] || patient.stage}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onClearFlag(patient.id)}
        disabled={isClearing}
        className="shrink-0 text-xs h-8 px-3 border-[#E8792E] text-[#E8792E] hover:bg-[#E8792E] hover:text-white"
      >
        {isClearing ? <Loader2 className="w-3 h-3 animate-spin" /> : "Clear Flag"}
      </Button>
    </div>
  )
}
