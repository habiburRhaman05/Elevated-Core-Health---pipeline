"use client"

import { useState } from "react"
import { useAdminUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/query/useAdmin"
import { useAuth } from "@/hooks/auth/useAuth"
import { Loader2, Plus, Pencil, Trash2, Shield, ShieldCheck, AlertTriangle, User as UserIcon, Users, Clock, Eye, EyeOff, KeyRound } from "lucide-react"
import { PermissionsVaultModal } from "@/components/features/permissions-vault-modal"
import { Button } from "@/components/ui/button"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import z from "zod"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingsNav } from "@/components/features/settings-nav"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import type { User } from "@/types"
import { cn } from "@/lib/utils"
import { roleLabel } from "@/lib/roles"

export default function AdminUsersPage() {
  const { data: users, isLoading } = useAdminUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const { user: currentUser } = useAuth()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [typedDeleteText, setTypedDeleteText] = useState("")
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const targetUser = confirmDelete ? users?.find((u) => u.id === confirmDelete) ?? null : null

  const vaCount = users?.filter((u) => u.role === "va").length ?? 0
  const adminCount = users?.filter((u) => u.role === "admin" || u.role === "super_admin").length ?? 0

  const avatarClass = (role: string) =>
    role === "super_admin"
      ? "bg-gradient-to-br from-[#FBE7B2] to-amber-400 text-[#7A5C00]"
      : role === "admin"
        ? "bg-gradient-to-br from-[#036638] to-[#025030]"
        : "bg-gradient-to-br from-emerald-400 to-emerald-600"

  const roleBadgeClass = (role: string) =>
    role === "va"
      ? "bg-[#EBF7EC] text-[#036638] border-[#65BD6C]/30"
      : "bg-[#036638]/10 text-[#036638] border-[#036638]/15"

  // task.md §10, §11, §17 — the UI mirrors what the backend already enforces:
  // no self-delete, the Super Admin account is protected, and only a Super
  // Admin may delete an Admin.
  const canDeleteUser = (u: User) => {
    if (u.id === currentUser?.id) return false
    if (u.role === "super_admin") return false
    if (u.role === "admin" && currentUser?.role !== "super_admin") return false
    return true
  }

  const userFormSchema = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: z.string().trim().email("Enter a valid email address"),
    // Empty password is allowed in edit mode (keeps the current one); any value
    // entered must be at least 6 characters. Create mode requires it via onSubmit.
    password: z.string().refine((v) => v.length === 0 || v.length >= 6, "Password must be at least 6 characters"),
    role: z.enum(["va", "admin"]),
    shift: z.union([z.literal(""), z.enum(["morning", "evening"])]).optional(),
  })
  type UserFormValues = z.infer<typeof userFormSchema>

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
  })
  const [showPassword, setShowPassword] = useState(false)

  const openCreate = () => {
    setEditingUser(null)
    reset({
      name: "",
      email: "",
      password: "",
      role: "va",
      shift: "",
    })
    setModalOpen(true)
  }

  const openEdit = (user: User) => {
    setEditingUser(user)
    reset({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role === "va" ? "va" : "admin",
      shift: user.shift === "morning" || user.shift === "evening" ? user.shift : "",
    })
    setModalOpen(true)
  }

  const onSubmit = async (data: UserFormValues) => {
    // Create mode always requires a password (edit mode may leave it blank).
    if (!editingUser && !data.password) {
      setError("password", { message: "Password is required" })
      return
    }
    const payload = {
      name: data.name,
      email: data.email,
      role: data.role as "admin" | "va",
      shift: data.shift || null,
      ...(data.password ? { password: data.password } : {}),
    }

    if (editingUser) {
      await updateUser.mutateAsync({ id: editingUser.id, ...payload })
    } else {
      await createUser.mutateAsync(payload as any)
    }
    setModalOpen(false)
  }

  const closeDeleteModal = () => {
    setConfirmDelete(null)
    setDeleteStep(1)
    setTypedDeleteText("")
    setDeleteError(null)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteUser.mutateAsync(id)
      closeDeleteModal()
    } catch (err: any) {
      // Keep the modal open and surface the backend's reason inline (the hook
      // also toasts it) — e.g. the VA still has assigned patients.
      setDeleteError(err?.response?.data?.message || "Failed to delete user")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-[#036638] animate-spin" />
      </div>
    )
  }

  return (
    <>
      {/* Settings Navigation - Top */}
      {/* <SettingsNav currentPage="users" /> */}

      <div className="space-y-4 max-w-[1600px] mx-auto">
        {/* - Page Header - */}
        <div className="rounded-2xl border border-[#EDEFF2] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] px-4 py-3.5 sm:px-5">
          <PageHeader
            breadcrumb="Settings · Users"
            title="User Management"
            subtitle="Manage the three portal accounts"
            icon={Users}
            count={
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EBF7EC] border border-[#65BD6C]/30 text-[11px] font-bold text-[#036638]">
                <Users className="w-3 h-3" />
                {users?.length ?? 0} accounts
              </span>
            }
            actions={
              <Button
                onClick={openCreate}
                className="bg-gradient-to-r from-[#036638] to-[#025030] hover:from-[#025030] hover:to-[#014324] text-white text-xs gap-1.5 shadow-[0_4px_14px_rgba(3,102,56,0.25)]"
              >
                <Plus className="w-4 h-4" />
                Add User
              </Button>
            }
          />
        </div>

        {/* - Team stats - */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Total Accounts" value={users?.length ?? 0} icon={Users} />
          <StatCard label="VA Staff" value={vaCount} icon={UserIcon} />
          <StatCard label="Admins" value={adminCount} icon={Shield} />
        </div>

        {/* - User list - */}
        <div className="bg-white rounded-2xl border border-[#EDEFF2] divide-y divide-[#F3F4F6] overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
          {users && users.length > 0 ? (
            users.map((user) => (
              <div key={user.id} className="flex flex-wrap items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-[#EBF7EC]/30 transition-colors group">
                <div className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-sm shadow-sm overflow-hidden",
                  avatarClass(user.role),
                )}>
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element -- real user avatar from DB (Cloudinary URL)
                    <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  ) : user.role === "super_admin" ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : (
                    user.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm font-semibold text-[#1A1B1E] truncate flex items-center gap-2">
                    {user.name}
                    {user.id === currentUser?.id && (
                      <span className="text-[9px] font-bold uppercase tracking-wide bg-[#036638]/10 text-[#036638] px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#6B7280] truncate mt-0.5">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border",
                    roleBadgeClass(user.role),
                  )}>
                    {user.role === "va" ? (
                      <UserIcon className="w-3 h-3" />
                    ) : (
                      <Shield className="w-3 h-3" />
                    )}
                    {roleLabel(user.role)}
                  </span>
                  {user.shift && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#6B7280] bg-[#F4F5F7] border border-[#E5E7EB] px-2.5 py-1 rounded-full">
                      <Clock className="w-3 h-3" />
                      {user.shift}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {user.role === "super_admin" ? (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2.5 py-1.5 rounded-lg bg-[#FBE7B2]/60 text-[#8A6D1D]">
                      <ShieldCheck className="w-3 h-3" />
                      Protected
                    </span>
                  ) : (
                    <>
                      {user.role === "va" && (
                        <button
                          onClick={() => setPermissionsUser(user)}
                          className="p-2 rounded-lg border border-transparent hover:border-[#E5E7EB] hover:bg-[#EBF7EC] text-[#6B7280] hover:text-[#036638] transition-colors"
                          title="Manage permissions"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(user)}
                        className="p-2 rounded-lg border border-transparent hover:border-[#E5E7EB] hover:bg-[#EBF7EC] text-[#6B7280] hover:text-[#036638] transition-colors"
                        title="Edit user"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {canDeleteUser(user) && (
                        <button
                          onClick={() => {
                            setConfirmDelete(user.id)
                            setDeleteStep(1)
                            setTypedDeleteText("")
                            setDeleteError(null)
                          }}
                          className="p-2 rounded-lg border border-transparent hover:border-red-200 hover:bg-red-50 text-[#6B7280] hover:text-red-500 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#EBF7EC] flex items-center justify-center mb-3">
                <Users className="w-5 h-5 text-[#036638]" />
              </div>
              <p className="text-sm font-medium text-[#6B7280]">No users found</p>
            </div>
          )}
        </div>

      {/* Delete Confirmation — two steps (task.md §9): warning first, then typed "DELETE" */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open && !deleteUser.isPending) closeDeleteModal()
        }}
      >
        <DialogContent
          className="sm:max-w-md p-0 gap-0 overflow-hidden"
          onEscapeKeyDown={(e) => {
            if (deleteUser.isPending) e.preventDefault()
          }}
          onPointerDownOutside={(e) => {
            if (deleteUser.isPending) e.preventDefault()
          }}
        >
          {deleteError && (
            <div className="px-6 pt-4">
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] text-red-700 leading-relaxed">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-red-500" />
                <span>{deleteError}</span>
              </div>
            </div>
          )}
          {targetUser && deleteStep === 1 ? (
            <>
              {/* Step 1 — Warning confirmation */}
              <div className="px-6 pt-6 pb-4 bg-gradient-to-b from-red-50/70 to-white">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-full bg-red-500/10 border border-red-200/60 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-[#1A1B1E]">Delete user?</h3>
                    <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                      You are about to permanently delete{" "}
                      <span className="font-semibold text-[#1A1B1E]">{targetUser.name}</span>. This
                      action cannot be undone.
                    </p>
                  </div>
                </div>

                {/* User summary card */}
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-[#036638] text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                    {targetUser.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element -- real user avatar from DB (Cloudinary URL)
                      <img src={targetUser.avatar} alt={targetUser.name} className="w-full h-full object-cover" />
                    ) : (
                      targetUser.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1B1E] truncate">{targetUser.name}</p>
                    <p className="text-xs text-[#6B7280] truncate">{targetUser.email}</p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-[#036638]/10 text-[#036638] shrink-0">
                    {roleLabel(targetUser.role)}
                  </span>
                </div>
              </div>

              {typeof targetUser.assignedPatientCount === "number" && targetUser.assignedPatientCount > 0 && (
                <div className="px-6 py-3 bg-red-50 border-y border-red-200 text-[11px] text-red-700 leading-relaxed flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
                  <span>
                    <span className="font-bold">Deletion blocked:</span> {targetUser.assignedPatientCount}{" "}
                    patient{targetUser.assignedPatientCount === 1 ? " is" : "s are"} still assigned to{" "}
                    {targetUser.name}. Reassign {targetUser.assignedPatientCount === 1 ? "them" : "those patients"}{" "}
                    to another VA first, then delete this account.
                  </span>
                </div>
              )}

              <div className="px-6 py-3 bg-[#FEFCE8] border-y border-amber-100 text-[11px] text-amber-800 leading-relaxed flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Deleting removes {targetUser.name}&apos;s portal access immediately. Their activity
                  history is preserved in the audit log with a name snapshot.
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 px-6 py-4">
                <span className="text-[10px] font-medium text-[#9CA3AF]">Step 1 of 2</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={closeDeleteModal} className="text-xs">
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setDeleteError(null)
                      setDeleteStep(2)
                    }}
                    disabled={
                      typeof targetUser.assignedPatientCount === "number" &&
                      targetUser.assignedPatientCount > 0
                    }
                    title={
                      targetUser.assignedPatientCount
                        ? "Reassign this user's patients first"
                        : undefined
                    }
                    className="text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {typeof targetUser.assignedPatientCount === "number" && targetUser.assignedPatientCount > 0
                      ? "Reassign Patients First"
                      : "Continue"}
                  </Button>
                </div>
              </div>
            </>
          ) : targetUser ? (
            <>
              {/* Step 2 — Typed confirmation */}
              <div className="px-6 pt-6 pb-4 bg-gradient-to-b from-red-50/70 to-white">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-full bg-red-500/10 border border-red-200/60 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-[#1A1B1E]">Confirm permanent deletion</h3>
                    <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                      Type{" "}
                      <span className="font-mono font-bold text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">
                        DELETE
                      </span>{" "}
                      to permanently remove{" "}
                      <span className="font-semibold text-[#1A1B1E]">{targetUser.name}</span>. This
                      cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 mt-4">
                <label className="text-[11px] font-semibold text-[#374151] uppercase tracking-wider">
                  Type DELETE to confirm
                </label>
                <input
                  type="text"
                  value={typedDeleteText}
                  onChange={(e) => setTypedDeleteText(e.target.value)}
                  placeholder="DELETE"
                  autoFocus
                  className={`mt-1.5 w-full h-11 px-3 rounded-lg border text-sm font-mono text-center focus:outline-none focus:ring-2 transition-all ${
                    typedDeleteText.length > 0 && typedDeleteText !== "DELETE"
                      ? "border-red-400 bg-red-50/40 focus:ring-red-500/30"
                      : typedDeleteText === "DELETE"
                        ? "border-[#036638] bg-[#EBF7EC]/60 focus:ring-[#036638]/30"
                        : "border-[#E5E7EB] focus:ring-red-500/30 focus:border-red-400"
                  }`}
                  onKeyDown={(e) => {
                    // Accept Enter once the exact text matches — mirrors the
                    // disabled Delete Account button without surprising submit behavior.
                    if (e.key === "Enter" && typedDeleteText === "DELETE" && !deleteUser.isPending) {
                      e.preventDefault()
                      handleDelete(targetUser.id)
                    }
                  }}
                />
                {typedDeleteText.length > 0 && typedDeleteText !== "DELETE" && (
                  <p className="text-[11px] text-red-500 mt-1.5">
                    Text does not match. Type exactly <span className="font-mono font-bold">DELETE</span>.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 px-6 py-4 mt-2">
                <span className="text-[10px] font-medium text-[#9CA3AF]">Step 2 of 2</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDeleteStep(1)} className="text-xs" disabled={deleteUser.isPending}>
                    Back
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(targetUser.id)}
                    disabled={typedDeleteText !== "DELETE" || deleteUser.isPending}
                    className="text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deleteUser.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete Account"
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#1A1B1E]">
              {editingUser ? "Edit User" : "Add User"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">Name</label>
              <input
                {...register("name")}
                className={`w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-all ${
                  errors.name
                    ? "border-[#CC3333]/50 bg-[#CC3333]/5 focus:ring-[#CC3333]/25 focus:border-[#CC3333]/60"
                    : "border-[#E5E7EB] focus:ring-[#036638]/30"
                }`}
              />
              {errors.name && <p className="text-[11px] text-[#CC3333] mt-1">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">Email</label>
              <input
                type="email"
                {...register("email")}
                className={`w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-all ${
                  errors.email
                    ? "border-[#CC3333]/50 bg-[#CC3333]/5 focus:ring-[#CC3333]/25 focus:border-[#CC3333]/60"
                    : "border-[#E5E7EB] focus:ring-[#036638]/30"
                }`}
              />
              {errors.email && <p className="text-[11px] text-[#CC3333] mt-1">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">
                Password {editingUser && "(leave blank to keep current)"}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  {...register("password")}
                  className={`w-full h-9 pl-3 pr-10 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-all ${
                    errors.password
                      ? "border-[#CC3333]/50 bg-[#CC3333]/5 focus:ring-[#CC3333]/25 focus:border-[#CC3333]/60"
                      : "border-[#E5E7EB] focus:ring-[#036638]/30"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#036638] hover:bg-[#F3F4F6] transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-[11px] text-[#CC3333] mt-1">{errors.password.message}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#374151]">Role</label>
                <Select value={watch("role")} onValueChange={(v) => setValue("role", v as "va" | "admin")}>
                  <SelectTrigger className="w-full h-9 rounded-lg border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] shadow-none focus:ring-2 focus:ring-[#036638]/30 cursor-pointer">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="va">VA</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#374151]">Shift</label>
                <Select value={watch("shift")} onValueChange={(v) => setValue("shift", v as "" | "morning" | "evening")}>
                  <SelectTrigger className="w-full h-9 rounded-lg border-[#E5E7EB] bg-white text-sm text-[#1A1B1E] shadow-none focus:ring-2 focus:ring-[#036638]/30 cursor-pointer">
                    <SelectValue placeholder="No shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No shift</SelectItem>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createUser.isPending || updateUser.isPending}
                className="bg-[#036638] hover:bg-[#025030] text-white text-xs"
              >
                {createUser.isPending || updateUser.isPending
                  ? "Saving..."
                  : editingUser
                    ? "Save Changes"
                    : "Create User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <PermissionsVaultModal
        userId={permissionsUser?.id ?? null}
        userName={permissionsUser?.name ?? ""}
        onClose={() => setPermissionsUser(null)}
      />
      </div>
    </>
  )
}
