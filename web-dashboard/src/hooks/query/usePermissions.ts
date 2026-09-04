"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { PermissionsService } from "@/services/permissions.service"
import { QUERY_KEYS } from "@/constants"
import { useAuth } from "@/hooks/auth/useAuth"
import type { VaPermissionKey } from "@/types"

/** Admin: a VA's full permission catalog + current grants. */
export function useVaPermissions(userId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.ADMIN.PERMISSIONS(userId),
    queryFn: () => PermissionsService.getForUser(userId),
    enabled: !!userId,
  })
}

export function useUpdateVaPermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, grants }: { userId: string; grants: { key: VaPermissionKey; granted: boolean }[] }) =>
      PermissionsService.updateForUser(userId, grants),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.ADMIN.PERMISSIONS(vars.userId) })
      toast.success("Permissions updated")
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Failed to update permissions")
    },
  })
}

/**
 * The CURRENT user's own effective permission map — what patient-modal/board
 * buttons read to hide/disable an action the VA isn't currently granted.
 * Gated on auth like usePatients, since this is fetched app-wide once logged in.
 */
export function useMyPermissions() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: QUERY_KEYS.MY_PERMISSIONS,
    queryFn: () => PermissionsService.getMine(),
    enabled: isAuthenticated,
    // Permissions rarely change mid-session; avoid refetching on every focus.
    staleTime: 5 * 60 * 1000,
  })
}
