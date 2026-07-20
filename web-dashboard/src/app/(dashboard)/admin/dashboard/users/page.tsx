"use client"

import { useState } from "react"
import { useAdminUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/hooks/query/useAdmin"
import { Loader2, Plus, Pencil, Trash2, Shield, User as UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useForm } from "react-hook-form"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { User } from "@/types"
import { cn } from "@/lib/utils"

export default function AdminUsersPage() {
  const { data: users, isLoading } = useAdminUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

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
      role: user.role,
      shift: user.shift || "",
    })
    setModalOpen(true)
  }

  const onSubmit = async (data: any) => {
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

  const handleDelete = async (id: string) => {
    await deleteUser.mutateAsync(id)
    setConfirmDelete(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-[#E8792E] animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4  max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1A1B1E]">User Management</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Manage the three portal accounts
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#E8792E] hover:bg-[#D4691F] text-white text-xs gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]/50 overflow-hidden">
        {users && users.length > 0 ? (
          users.map((user) => (
            <div key={user.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#FFF0E5]/30 transition-colors">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                user.role === "admin" ? "bg-[#E8792E]" : "bg-[#FFF0E5]",
              )}>
                {user.role === "admin" ? (
                  <Shield className="w-5 h-5 text-white" />
                ) : (
                  <UserIcon className="w-5 h-5 text-[#E8792E]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1A1B1E] truncate">{user.name}</p>
                <p className="text-xs text-[#6B7280]">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-[10px] font-semibold uppercase px-2 py-0.5 rounded",
                  user.role === "admin"
                    ? "bg-[#E8792E]/10 text-[#E8792E]"
                    : "bg-[#FFF0E5] text-[#E8792E]",
                )}>
                  {user.role}
                </span>
                {user.shift && (
                  <span className="text-[10px] text-[#6B7280] bg-[#F4F5F7] px-2 py-0.5 rounded">
                    {user.shift}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(user)}
                  className="p-1.5 rounded-lg hover:bg-[#FFF0E5] text-[#6B7280] hover:text-[#E8792E] transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(user.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-[#6B7280] hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-sm text-[#6B7280]">No users found</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm mx-4">
            <p className="text-sm font-semibold text-[#1A1B1E] mb-2">Delete user?</p>
            <p className="text-xs text-[#6B7280] mb-4">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleDelete(confirmDelete)}
                className="bg-red-500 hover:bg-red-600 text-white text-xs"
                disabled={deleteUser.isPending}
              >
                {deleteUser.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
                {...register("name", { required: "Name is required" })}
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30"
              />
              {errors.name && <p className="text-[11px] text-red-500">{errors.name.message as string}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">Email</label>
              <input
                type="email"
                {...register("email", { required: "Email is required" })}
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30"
              />
              {errors.email && <p className="text-[11px] text-red-500">{errors.email.message as string}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">
                Password {editingUser && "(leave blank to keep current)"}
              </label>
              <input
                type="password"
                {...register("password", editingUser ? {} : { required: "Password is required" })}
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30"
              />
              {errors.password && <p className="text-[11px] text-red-500">{errors.password.message as string}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#374151]">Role</label>
                <select
                  {...register("role")}
                  className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 bg-white"
                >
                  <option value="va">VA</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#374151]">Shift</label>
                <input
                  {...register("shift")}
                  placeholder="e.g. Morning"
                  className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30"
                />
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
                className="bg-[#E8792E] hover:bg-[#D4691F] text-white text-xs"
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
    </div>
  )
}
