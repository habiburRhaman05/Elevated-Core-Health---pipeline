"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { QUERY_KEYS } from "@/constants"
import {
  PasswordVaultService,
  type CreateEntryPayload,
  type UpdateEntryPayload,
} from "@/services/password-vault.service"

function apiMessage(err: unknown, fallback: string): string {
  const apiErr = err as { response?: { data?: { message?: string } } }
  return apiErr?.response?.data?.message || fallback
}

// ---- Admin: groups ----
export function usePasswordGroups() {
  return useQuery({
    queryKey: QUERY_KEYS.PASSWORD_VAULT.GROUPS,
    queryFn: () => PasswordVaultService.listGroups(),
  })
}

export function useCreatePasswordGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => PasswordVaultService.createGroup(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.GROUPS })
      toast.success("Group created")
    },
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to create group")),
  })
}

export function useRenamePasswordGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => PasswordVaultService.renameGroup(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.GROUPS })
      toast.success("Group renamed")
    },
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to rename group")),
  })
}

export function useDeletePasswordGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => PasswordVaultService.deleteGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.GROUPS })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.ENTRIES })
      toast.success("Group deleted — its passwords were ungrouped, not deleted")
    },
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to delete group")),
  })
}

export function useSetGroupAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) => PasswordVaultService.setGroupAccess(id, userIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.GROUPS })
      toast.success("Group access updated")
    },
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to update group access")),
  })
}

// ---- Admin: entries ----
export function usePasswordEntries() {
  return useQuery({
    queryKey: QUERY_KEYS.PASSWORD_VAULT.ENTRIES,
    queryFn: () => PasswordVaultService.listEntries(),
  })
}

export function useCreatePasswordEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateEntryPayload) => PasswordVaultService.createEntry(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.ENTRIES })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.GROUPS })
      toast.success("Password added")
    },
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to add password")),
  })
}

export function useUpdatePasswordEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEntryPayload }) =>
      PasswordVaultService.updateEntry(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.ENTRIES })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.GROUPS })
      toast.success("Password updated")
    },
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to update password")),
  })
}

export function useDeletePasswordEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => PasswordVaultService.deleteEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.ENTRIES })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.GROUPS })
      toast.success("Password deleted")
    },
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to delete password")),
  })
}

export function useSetEntryAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, userIds }: { id: string; userIds: string[] }) => PasswordVaultService.setEntryAccess(id, userIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PASSWORD_VAULT.ENTRIES })
      toast.success("Access updated")
    },
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to update access")),
  })
}

// Reveal is a mutation, not a query — it must fire fresh every time (never
// cached), since each call is its own audited, on-demand decrypt.
export function useRevealPasswordEntry() {
  return useMutation({
    mutationFn: (id: string) => PasswordVaultService.revealEntry(id),
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to reveal password")),
  })
}

// ---- VA: read-only ----
export function useMyPasswordEntries() {
  return useQuery({
    queryKey: QUERY_KEYS.PASSWORD_VAULT.MY_ENTRIES,
    queryFn: () => PasswordVaultService.listMyEntries(),
  })
}

export function useRevealMyPasswordEntry() {
  return useMutation({
    mutationFn: (id: string) => PasswordVaultService.revealMyEntry(id),
    onError: (err: unknown) => toast.error(apiMessage(err, "Failed to reveal password")),
  })
}
