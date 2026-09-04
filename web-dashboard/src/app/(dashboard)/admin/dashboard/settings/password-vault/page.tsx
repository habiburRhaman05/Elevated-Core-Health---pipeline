"use client"

import { KeyRound } from "lucide-react"
import { SettingsNav } from "@/components/features/settings-nav"
import { PageHeader } from "@/components/shared/page-header"
import { PasswordVaultManager } from "@/components/features/password-vault/password-vault-manager"

export default function AdminPasswordVaultPage() {
  return (
    <>
      <div className="sticky top-0 z-40 bg-[#F4F5F7]">
        <SettingsNav currentPage="password-vault" />
        <div className="max-w-5xl mx-auto px-1 pt-4 pb-4">
          <PageHeader
            breadcrumb="Settings · Password Vault"
            title="Password Vault"
            subtitle="Store shared credentials and control exactly which VA can see each one"
            icon={KeyRound}
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto pt-2 pb-16">
        <PasswordVaultManager />
      </div>
    </>
  )
}
