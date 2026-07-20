"use client"

import { useState } from "react"
import { useAuth } from "@/hooks/auth/useAuth"
import { AuthService } from "@/services/auth.service"
import { User, Shield, Save, Key, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function ProfilePage() {
  const { user, logout } = useAuth()

  const [name, setName] = useState(user?.name || "")
  const [email, setEmail] = useState(user?.email || "")
  const [saving, setSaving] = useState(false)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      await AuthService.updateProfile({ name, email })
      toast.success("Profile updated")
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters")
      return
    }
    setChangingPassword(true)
    try {
      await AuthService.changePassword(currentPassword, newPassword)
      toast.success("Password changed successfully")
      setShowPasswordForm(false)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to change password")
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-[#1A1B1E]">Profile</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Manage your account details and security
        </p>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-[#E5E7EB]/50">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            user?.role === "admin" ? "bg-[#E8792E]" : "bg-[#FFF0E5]",
          )}>
            {user?.role === "admin" ? (
              <Shield className="w-6 h-6 text-white" />
            ) : (
              <User className="w-6 h-6 text-[#E8792E]" />
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-[#1A1B1E]">{user?.name}</p>
            <p className="text-xs text-[#6B7280] capitalize">{user?.role}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#374151]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#1A1B1E] focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#374151]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm text-[#1A1B1E] focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 transition-all"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveProfile}
              disabled={saving}
              className="bg-[#E8792E] hover:bg-[#D4691F] text-white text-xs gap-1.5"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[#E8792E]" />
            <h2 className="text-sm font-bold text-[#1A1B1E]">Password</h2>
          </div>
          {!showPasswordForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPasswordForm(true)}
              className="text-xs border-[#E8792E]/30 text-[#E8792E]"
            >
              Change
            </Button>
          )}
        </div>

        {showPasswordForm && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPasswordForm(false)
                  setCurrentPassword("")
                  setNewPassword("")
                  setConfirmPassword("")
                }}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleChangePassword}
                disabled={changingPassword || !currentPassword || !newPassword}
                className="bg-[#E8792E] hover:bg-[#D4691F] text-white text-xs"
              >
                {changingPassword ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : null}
                {changingPassword ? "Changing..." : "Update Password"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
