"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query"
import { PatientsService } from "@/services/patients.service"
import { QUERY_KEYS } from "@/constants"
import { useAuth } from "@/hooks/auth/useAuth"
import { isAdminOrAbove } from "@/lib/roles"
import type { Patient, PatientStage } from "@/types"
import { toast } from "sonner"

export function usePatients(stage?: string, options?: { enabled?: boolean }) {
  const { user } = useAuth()
  const isAdmin = isAdminOrAbove(user?.role)

  // Normalize the query key so the common no-stage call (["patients"]) is
  // exactly QUERY_KEYS.PATIENTS.ALL — otherwise the optimistic writers below
  // (setQueryData(QUERY_KEYS.PATIENTS.ALL, ...)) target a different cache
  // entry than this hook reads, making checklist toggles only update after a
  // refetch instead of instantly.
  return useQuery({
    queryKey: stage ? [...QUERY_KEYS.PATIENTS.ALL, stage] : QUERY_KEYS.PATIENTS.ALL,
    queryFn: () => PatientsService.list(stage),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: options?.enabled,
    // Keep the previously-rendered cards on screen during any refetch (e.g.
    // right after Add Patient invalidates the cache) so the board can never
    // flash empty / lose the existing cards while waiting on the network.
    placeholderData: keepPreviousData,
    // task.md §17 / phase.md Phase 3 — a VA's world is their own assigned
    // patients plus the unassigned pool, never another VA's cards. The
    // backend already enforces this server-side (patientScopeFor), and this
    // belt-and-braces filter guarantees the board, workload calendar and
    // every other consumer of this hook can't render another VA's patient
    // even if a stale/leaky response ever got through. Admin/super_admin are
    // unaffected (no filter applied).
    select: isAdmin
      ? undefined
      : (patients: Patient[]) => patients.filter((p) => !p.assignedTo || p.assignedTo === user?.id),
  })
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PATIENTS.DETAIL(id),
    queryFn: () => PatientsService.getById(id),
    enabled: !!id,
  })
}

/** Backs the patient modal's Appointment History tab. Only fetches once that
 *  tab is actually opened (via `enabled`) — same lazy pattern as the modal's
 *  other secondary tabs. */
export function useAppointmentHistory(id: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.PATIENTS.APPOINTMENT_HISTORY(id),
    queryFn: () => PatientsService.getAppointmentHistory(id),
    enabled: !!id && enabled,
  })
}

export function useMoveStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, targetStage }: { id: string; targetStage: PatientStage }) =>
      PatientsService.moveStage(id, targetStage),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.DASHBOARD.SUMMARY })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Stage updated")
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message
      if (message?.includes("skip stages")) {
        toast.error("Cannot skip stages. Move forward one stage at a time.")
      } else if (message?.includes("checklist")) {
        toast.error("Please complete all checklist items before moving to the next stage.")
      } else {
        toast.error(message || "Failed to move stage")
      }
    },
  })
}

export function useAssignPatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, assignedTo }: { id: string; assignedTo: string | null }) =>
      PatientsService.assign(id, assignedTo),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Assignment updated")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to assign")
    },
  })
}

export function useChecklistItems() {
  return useQuery({
    queryKey: QUERY_KEYS.PATIENTS.CHECKLIST_ITEMS,
    queryFn: () => PatientsService.getChecklistItems(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useToggleChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      itemId,
      checked,
    }: {
      id: string
      itemId: string
      checked: boolean
    }) => PatientsService.toggleChecklist(id, itemId, checked),
    onMutate: async ({ id, itemId, checked }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      await qc.cancelQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(id) })

      const previousList = qc.getQueryData<Patient[]>(QUERY_KEYS.PATIENTS.ALL)
      const previousDetail = qc.getQueryData<Patient>(QUERY_KEYS.PATIENTS.DETAIL(id))

      qc.setQueryData<Patient[]>(QUERY_KEYS.PATIENTS.ALL, (old) => {
        if (!old) return old
        return old.map((p) => {
          if (p.id !== id) return p
          return {
            ...p,
            checklistState: {
              ...p.checklistState,
              [p.stage]: {
                ...(p.checklistState[p.stage] || {}),
                [itemId]: checked,
              },
            },
          }
        })
      })

      qc.setQueryData<Patient>(QUERY_KEYS.PATIENTS.DETAIL(id), (old) => {
        if (!old) return old
        return {
          ...old,
          checklistState: {
            ...old.checklistState,
            [old.stage]: {
              ...(old.checklistState[old.stage] || {}),
              [itemId]: checked,
            },
          },
        }
      })

      return { previousList, previousDetail }
    },
    onError: (err: any, vars, context) => {
      if (context?.previousList) {
        qc.setQueryData(QUERY_KEYS.PATIENTS.ALL, context.previousList)
      }
      if (context?.previousDetail) {
        qc.setQueryData(QUERY_KEYS.PATIENTS.DETAIL(vars.id), context.previousDetail)
      }
      toast.error(err?.response?.data?.message || "Failed to update checklist")
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
    },
  })
}

export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      PatientsService.addNote(id, content),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Note added")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to add note")
    },
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, noteId }: { id: string; noteId: string }) =>
      PatientsService.deleteNote(id, noteId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Note deleted")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to delete note")
    },
  })
}

export function useFlagPatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      reason,
      type,
    }: {
      id: string
      reason: string
      type?: "positive" | "negative"
    }) => PatientsService.flag(id, reason, type),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.DASHBOARD.SUMMARY })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Patient flagged for Donna")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to flag")
    },
  })
}

export function useClearFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, clearReason, flagId }: { id: string; clearReason: string; flagId?: string }) =>
      PatientsService.clearFlag(id, clearReason, flagId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.DASHBOARD.SUMMARY })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Flag cleared")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to clear flag")
    },
  })
}

export function useListVas() {
  return useQuery({
    queryKey: ["users", "vas"],
    queryFn: () => PatientsService.listVas(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useClaimPatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      PatientsService.claim(id, userId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Patient claimed")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to claim")
    },
  })
}

export function useCheckEligibility() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: { id: string } & Partial<{
      paymentMethod?: string | null
      insuranceProvider?: string | null
      paymentDetails?: Record<string, unknown> | null
    }>) => PatientsService.checkEligibility(id, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Eligibility check completed")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Eligibility check failed")
    },
  })
}

export function useIntake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof PatientsService.intake>[0]) =>
      PatientsService.intake(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Patient added via test intake")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Intake failed")
    },
  })
}

export function useUpdatePatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: { id: string } & Partial<{
      firstName: string | null
      lastName: string | null
      location: string | null
      email: string | null
      phone: string | null
      dateOfBirth: string | null
      copayAmount: string | null
      amountPaid: string | null
      paymentMethod: string | null
      insuranceProvider: string | null
      visitStatus: string
    }>) => PatientsService.updatePatient(id, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CRM.CONTACTS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Patient updated")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to update patient")
    },
  })
}

export function useLockPatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => PatientsService.lockPatient(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CRM.CONTACTS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Patient locked")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to lock patient")
    },
  })
}

export function useUnlockPatient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => PatientsService.unlockPatient(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CRM.CONTACTS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Patient unlocked")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to unlock patient")
    },
  })
}

export function useUpdatePatientStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & { status: "active" | "cancelled"; reason?: string | null }) =>
      PatientsService.updateStatus(id, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.CRM.CONTACTS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Status updated")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to update status")
    },
  })
}

export function useUpdateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, appointmentDatetime }: { id: string; appointmentDatetime: string }) =>
      PatientsService.updateAppointment(id, appointmentDatetime),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.DETAIL(vars.id) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PATIENTS.ALL })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ACTIVITY_LOG.ALL })
      toast.success("Appointment updated and emails sent to patient and admin")
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Failed to update appointment")
    },
  })
}
