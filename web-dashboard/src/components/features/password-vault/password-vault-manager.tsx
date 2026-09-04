"use client"

import { useState } from "react"
import { KeyRound, Loader2, Plus, FolderPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  usePasswordGroups,
  usePasswordEntries,
  useCreatePasswordGroup,
  useCreatePasswordEntry,
  useUpdatePasswordEntry,
  useDeletePasswordEntry,
  useRenamePasswordGroup,
  useDeletePasswordGroup,
  useSetGroupAccess,
  useSetEntryAccess,
  useRevealPasswordEntry,
} from "@/hooks/query/usePasswordVault"
import type { PasswordEntry, PasswordGroup } from "@/types"
import type { CreateEntryPayload } from "@/services/password-vault.service"
import { PasswordGroupSection } from "./password-group-section"
import { EntryFormModal, type EntryFormValues } from "./entry-form-modal"
import { GroupFormModal } from "./group-form-modal"
import { AccessModal } from "./access-modal"
import { DeleteConfirmModal } from "./delete-confirm-modal"
import { groupEntriesByGroup } from "./types"

export function PasswordVaultManager() {
  const { data: groups, isLoading: groupsLoading } = usePasswordGroups()
  const { data: entries, isLoading: entriesLoading } = usePasswordEntries()

  const createGroup = useCreatePasswordGroup()
  const renameGroup = useRenamePasswordGroup()
  const deleteGroup = useDeletePasswordGroup()
  const setGroupAccess = useSetGroupAccess()
  const createEntry = useCreatePasswordEntry()
  const updateEntry = useUpdatePasswordEntry()
  const deleteEntry = useDeletePasswordEntry()
  const setEntryAccess = useSetEntryAccess()
  const revealEntry = useRevealPasswordEntry()

  const [showGroupForm, setShowGroupForm] = useState<"create" | PasswordGroup | null>(null)
  const [entryForm, setEntryForm] = useState<"create" | PasswordEntry | null>(null)
  const [accessTarget, setAccessTarget] = useState<{ kind: "group" | "entry"; id: string; name: string; userIds: string[] } | null>(
    null,
  )
  const [deletingGroup, setDeletingGroup] = useState<PasswordGroup | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<PasswordEntry | null>(null)
  const [revealingId, setRevealingId] = useState<string | null>(null)

  const isLoading = groupsLoading || entriesLoading
  const grouped = groupEntriesByGroup(entries ?? [])
  const ungrouped = grouped.ungrouped ?? []

  const handleReveal = async (id: string): Promise<string> => {
    setRevealingId(id)
    try {
      return await revealEntry.mutateAsync(id)
    } finally {
      setRevealingId(null)
    }
  }

  const handleSaveEntry = (values: EntryFormValues) => {
    const groupId = values.groupId === "none" ? null : values.groupId
    if (entryForm === "create") {
      const payload: CreateEntryPayload = {
        name: values.name.trim(),
        username: values.username.trim() || null,
        password: values.password,
        notes: values.notes.trim() || null,
        groupId,
        userIds: values.userIds,
      }
      createEntry.mutate(payload, { onSuccess: () => setEntryForm(null) })
    } else if (entryForm) {
      const id = entryForm.id
      updateEntry.mutate(
        {
          id,
          payload: {
            name: values.name.trim(),
            username: values.username.trim() || null,
            password: values.password.trim() || undefined,
            notes: values.notes.trim() || null,
            groupId,
          },
        },
        { onSuccess: () => setEntryForm(null) },
      )
      // Access on an existing entry is edited via the dedicated "Share access"
      // action, not silently overwritten here — the edit form doesn't touch it.
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#EBF7EC] flex items-center justify-center">
            <KeyRound className="w-4.5 h-4.5 text-[#036638]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#1A1B1E]">Password Vault</h3>
            <p className="text-xs text-[#6B7280]">{entries?.length ?? 0} passwords stored</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowGroupForm("create")} className="gap-1.5">
            <FolderPlus className="w-4 h-4" />
            New Group
          </Button>
          <Button
            size="sm"
            onClick={() => setEntryForm("create")}
            className="bg-[#036638] hover:bg-[#025030] text-white gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Password
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#036638] animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {(groups ?? []).map((group) => (
            <PasswordGroupSection
              key={group.id}
              title={group.name}
              entryCount={group.entryCount}
              entries={grouped[group.id] ?? []}
              readOnly={false}
              revealingId={revealingId}
              onReveal={handleReveal}
              onEditEntry={setEntryForm}
              onShareEntry={(entry) =>
                setAccessTarget({ kind: "entry", id: entry.id, name: entry.name, userIds: entry.access?.map((u) => u.id) ?? [] })
              }
              onDeleteEntry={setDeletingEntry}
              onRenameGroup={() => setShowGroupForm(group)}
              onShareGroup={() =>
                setAccessTarget({ kind: "group", id: group.id, name: group.name, userIds: group.access.map((u) => u.id) })
              }
              onDeleteGroup={() => setDeletingGroup(group)}
            />
          ))}

          {ungrouped.length > 0 && (
            <PasswordGroupSection
              title="Ungrouped"
              entryCount={ungrouped.length}
              entries={ungrouped}
              readOnly={false}
              revealingId={revealingId}
              onReveal={handleReveal}
              onEditEntry={setEntryForm}
              onShareEntry={(entry) =>
                setAccessTarget({ kind: "entry", id: entry.id, name: entry.name, userIds: entry.access?.map((u) => u.id) ?? [] })
              }
              onDeleteEntry={setDeletingEntry}
            />
          )}

          {(groups ?? []).length === 0 && ungrouped.length === 0 && (
            <div className="text-center py-16">
              <KeyRound className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400 italic">No passwords in the vault yet</p>
            </div>
          )}
        </div>
      )}

      <EntryFormModal
        key={entryForm === "create" ? "create" : (entryForm?.id ?? "closed")}
        open={!!entryForm}
        mode={entryForm === "create" ? "create" : "edit"}
        entry={entryForm === "create" ? null : entryForm}
        groups={groups ?? []}
        isSaving={createEntry.isPending || updateEntry.isPending}
        onCancel={() => setEntryForm(null)}
        onSave={handleSaveEntry}
      />

      <GroupFormModal
        key={showGroupForm === "create" ? "create" : (showGroupForm?.id ?? "closed")}
        open={!!showGroupForm}
        title={showGroupForm === "create" ? "New Group" : "Rename Group"}
        initialValue={showGroupForm === "create" ? "" : (showGroupForm?.name ?? "")}
        isSaving={createGroup.isPending || renameGroup.isPending}
        onCancel={() => setShowGroupForm(null)}
        onSave={(name) => {
          if (showGroupForm === "create") {
            createGroup.mutate(name, { onSuccess: () => setShowGroupForm(null) })
          } else if (showGroupForm) {
            renameGroup.mutate({ id: showGroupForm.id, name }, { onSuccess: () => setShowGroupForm(null) })
          }
        }}
      />

      <AccessModal
        key={accessTarget ? `${accessTarget.kind}-${accessTarget.id}` : "closed"}
        open={!!accessTarget}
        title={accessTarget ? `Share "${accessTarget.name}"` : ""}
        description={
          accessTarget?.kind === "group"
            ? "Everyone checked here can see every password in this group."
            : "Everyone checked here can see this password."
        }
        initialUserIds={accessTarget?.userIds ?? []}
        isSaving={setGroupAccess.isPending || setEntryAccess.isPending}
        onCancel={() => setAccessTarget(null)}
        onSave={(userIds) => {
          if (!accessTarget) return
          if (accessTarget.kind === "group") {
            setGroupAccess.mutate({ id: accessTarget.id, userIds }, { onSuccess: () => setAccessTarget(null) })
          } else {
            setEntryAccess.mutate({ id: accessTarget.id, userIds }, { onSuccess: () => setAccessTarget(null) })
          }
        }}
      />

      <DeleteConfirmModal
        open={!!deletingGroup}
        title={`Delete "${deletingGroup?.name ?? ""}"?`}
        description="Passwords inside this group will be ungrouped, not deleted."
        isDeleting={deleteGroup.isPending}
        onCancel={() => setDeletingGroup(null)}
        onConfirm={() => {
          if (!deletingGroup) return
          deleteGroup.mutate(deletingGroup.id, { onSuccess: () => setDeletingGroup(null) })
        }}
      />

      <DeleteConfirmModal
        open={!!deletingEntry}
        title={`Delete "${deletingEntry?.name ?? ""}"?`}
        description="This cannot be undone."
        isDeleting={deleteEntry.isPending}
        onCancel={() => setDeletingEntry(null)}
        onConfirm={() => {
          if (!deletingEntry) return
          deleteEntry.mutate(deletingEntry.id, { onSuccess: () => setDeletingEntry(null) })
        }}
      />
    </div>
  )
}
