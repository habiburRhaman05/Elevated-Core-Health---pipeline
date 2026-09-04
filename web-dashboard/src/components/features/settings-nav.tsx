"use client"

import { KeyRound, Lock, Webhook } from "lucide-react"
import Link from "next/link"
import { ROUTES } from "@/constants"
import { useAuth } from "@/hooks/auth/useAuth"
import { cn } from "@/lib/utils"
import { isAdminOrAbove } from "@/lib/roles"

interface SettingsNavProps {
  currentPage: "profile" | "users" | "stages" | "webhooks" | "password-vault"
  className?: string
}

export function SettingsNav({ currentPage, className }: SettingsNavProps) {
  const { user } = useAuth()
  const isAdmin = isAdminOrAbove(user?.role)
  const profileHref = isAdmin ? ROUTES.ADMIN.PROFILE : ROUTES.DASHBOARD.PROFILE

  // CRM Connect (and the old, non-functional Webhooks page) were removed
  // previously. Webhooks is back — admin-only, since it manages the shared
  // intake secret — while Profile stays visible to everyone this nav serves
  // (VAs and admins alike).
  const settingsPages = [
    {
      id: "profile" as const,
      label: "Profile",
      icon: Lock,
      desc: "Account & security",
      href: profileHref,
    },
    {
      id: "password-vault" as const,
      label: "Password Vault",
      icon: KeyRound,
      desc: "Shared credentials",
      href: isAdmin ? ROUTES.ADMIN.SETTINGS_PASSWORD_VAULT : ROUTES.DASHBOARD.SETTINGS_PASSWORD_VAULT,
    },
    ...(isAdmin
      ? [
          {
            id: "webhooks" as const,
            label: "Webhooks",
            icon: Webhook,
            desc: "Intake endpoint, secret key & test sends",
            href: ROUTES.ADMIN.SETTINGS_WEBHOOKS,
          },
        ]
      : []),
  ]

  return (
    <div className={cn("", className)}>
      {/* Premium Tab Navigation */}
      <div className="bg-gradient-to-r from-[#F9FAFB] to-white border-b border-[#E5E7EB] sticky top-0 z-40">
        <div className="flex items-start justify-start gap-1 px-6 py-4">
          {/* Navigation Tabs */}
          <div className="flex items-start gap-0 w-full">
            {settingsPages.map((page) => {
              const Icon = page.icon
              const isActive = currentPage === page.id

              return (
                <Link
                  key={page.id}
                  href={page.href}
                  className={cn(
                    "relative px-5 py-3 text-sm font-medium transition-all flex items-center gap-2 group whitespace-nowrap",
                    "border-b-2 -mb-4 pb-4",
                    isActive
                      ? "text-[#036638] border-b-[#036638]"
                      : "text-[#6B7280] border-b-transparent hover:text-[#1A1B1E]"
                  )}
                  title={page.desc}
                >
                  {/* Icon with background on hover/active */}
                  <div
                    className={cn(
                      "w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0",
                      isActive
                        ? "bg-[#036638]/15 text-[#036638]"
                        : "text-[#6B7280] group-hover:bg-[#F3F4F6]"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Label */}
                  <span>{page.label}</span>

                  {/* Active indicator dot */}
                  {isActive && (
                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#036638] animate-pulse" />
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
