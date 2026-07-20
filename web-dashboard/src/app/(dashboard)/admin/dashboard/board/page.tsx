"use client"

import { useState } from "react"
import { usePatients, useMoveStage } from "@/hooks/query/usePatients"
import { PatientCard } from "@/components/features/patient-card"
import { PatientModal } from "@/components/features/patient-modal"
import { STAGE_ORDER, STAGE_LABELS, STAGE_HINTS } from "@/types"
import type { Patient, PatientStage } from "@/types"
import { Loader2 } from "lucide-react"

export default function AdminBoardPage() {
  const { data: patients, isLoading, error } = usePatients()
  const moveStage = useMoveStage()
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)

  const groupedPatients =
    patients?.reduce(
      (acc, p) => {
        if (!acc[p.stage]) acc[p.stage] = []
        acc[p.stage].push(p)
        return acc
      },
      {} as Record<string, Patient[]>,
    ) || {}

  const handleMoveStage = (id: string, target: PatientStage) => {
    moveStage.mutate({ id, targetStage: target })
  }

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
    <div className="h-[calc(100vh-9rem)]  -mx-6 -mb-6 overflow-x-auto">
      <div className="inline-flex h-full gap-3 p-6 min-w-max">
        {STAGE_ORDER.map((stage) => {
          const stagePatients = groupedPatients[stage] || []
          return (
            <div
              key={stage}
              className="w-72 flex flex-col bg-[#FFF0E5]/40 rounded-xl border border-[#E5E7EB]/50 shrink-0"
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
                  stagePatients.map((patient) => (
                    <PatientCard
                      key={patient.id}
                      patient={patient}
                      onMoveStage={handleMoveStage}
                      onClick={(p) => setSelectedPatientId(p.id)}
                    />
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-xs text-[#6B7280] italic">No patients</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <PatientModal
        patientId={selectedPatientId}
        open={!!selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
      />
    </div>
  )
}
