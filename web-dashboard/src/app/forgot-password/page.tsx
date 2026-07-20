"use client"

import { useState } from "react"
import Link from "next/link"
import { AuthService } from "@/services/auth.service"
import { ROUTES } from "@/constants"
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    try {
      await AuthService.forgotPassword(email)
      setSent(true)
    } catch {
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-[#E5E7EB] p-8 shadow-sm">
        {sent ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#FFF0E5] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 text-[#E8792E]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#1A1B1E]">Check your email</h1>
              <p className="text-sm text-[#6B7280] mt-1">
                If an account with <strong className="text-[#1A1B1E]">{email}</strong> exists,
                we&apos;ve sent password reset instructions.
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
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h1 className="text-lg font-bold text-[#1A1B1E]">Forgot password?</h1>
              <p className="text-sm text-[#6B7280] mt-1">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#374151]">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full h-10 pl-10 pr-3 rounded-lg border border-[#E5E7EB] text-sm text-[#1A1B1E] focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 transition-all"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={sending || !email.trim()}
              className="w-full bg-[#E8792E] hover:bg-[#D4691F] text-white text-sm h-10"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {sending ? "Sending..." : "Send reset link"}
            </Button>

            <Link
              href={ROUTES.LOGIN}
              className="flex items-center justify-center gap-1.5 text-sm text-[#6B7280] hover:text-[#E8792E] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
