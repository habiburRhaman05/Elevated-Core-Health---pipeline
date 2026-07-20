"use client"

import { useState, use, Suspense } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AuthService } from "@/services/auth.service"
import { ROUTES } from "@/constants"
import { Lock, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resetting, setResetting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match")
      return
    }
    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters")
      return
    }
    setResetting(true)
    try {
      await AuthService.resetPassword(token, newPassword)
      setDone(true)
    } catch (err: any) {
      alert(err?.response?.data?.message || "Reset failed. The link may be expired.")
    } finally {
      setResetting(false)
    }
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#FFF0E5] flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6 text-[#E8792E]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#1A1B1E]">Password reset</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Your password has been updated successfully.
          </p>
        </div>
        <Link
          href={ROUTES.LOGIN}
          className="inline-flex items-center gap-1.5 text-sm text-[#E8792E] font-medium hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-[#1A1B1E]">Reset password</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Enter your new password below.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[#374151]">New password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min. 6 characters"
            required
            minLength={6}
            className="w-full h-10 pl-10 pr-3 rounded-lg border border-[#E5E7EB] text-sm text-[#1A1B1E] focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 transition-all"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[#374151]">Confirm password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            required
            minLength={6}
            className="w-full h-10 pl-10 pr-3 rounded-lg border border-[#E5E7EB] text-sm text-[#1A1B1E] focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 transition-all"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={resetting || !newPassword || !confirmPassword}
        className="w-full bg-[#E8792E] hover:bg-[#D4691F] text-white text-sm h-10"
      >
        {resetting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : null}
        {resetting ? "Resetting..." : "Reset password"}
      </Button>

      <Link
        href={ROUTES.LOGIN}
        className="flex items-center justify-center gap-1.5 text-sm text-[#6B7280] hover:text-[#E8792E] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to login
      </Link>
    </form>
  )
}

function ResetPasswordPageInner() {
  const params = use<any>(Promise.resolve({}))
  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams()
  const token = searchParams.get("token") || ""

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6 text-[#E8792E]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#1A1B1E]">Invalid link</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            This reset link is missing or invalid.
          </p>
        </div>
        <Link
          href={ROUTES.FORGOT_PASSWORD}
          className="text-sm text-[#E8792E] font-medium hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    )
  }

  return <ResetPasswordForm token={token} />
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-[#E5E7EB] p-8 shadow-sm">
        <Suspense fallback={<Loader2 className="w-6 h-6 text-[#E8792E] animate-spin mx-auto" />}>
          <ResetPasswordPageInner />
        </Suspense>
      </div>
    </div>
  )
}
