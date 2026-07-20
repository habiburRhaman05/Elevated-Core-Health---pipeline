"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Columns3,
  ClipboardList,
  Users,
  CheckSquare,
  ScrollText,
  LogOut,
  User,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/constants"
import { useAuth } from "@/hooks/auth/useAuth"

const VA_NAV = [
  { href: ROUTES.DASHBOARD.HOME, icon: LayoutDashboard, label: "Dashboard" },
  { href: ROUTES.DASHBOARD.BOARD, icon: Columns3, label: "Board" },
  { href: ROUTES.DASHBOARD.LOG, icon: ClipboardList, label: "Handoff Log" },
  { href: ROUTES.DASHBOARD.SOP, icon: ScrollText, label: "SOP Reference" },
  { href: ROUTES.DASHBOARD.PROFILE, icon: User, label: "Profile" },
]

const ADMIN_NAV = [
  { href: ROUTES.ADMIN.HOME, icon: LayoutDashboard, label: "Dashboard" },
  { href: ROUTES.ADMIN.BOARD, icon: Columns3, label: "Board" },
  { href: ROUTES.ADMIN.LOG, icon: ClipboardList, label: "Handoff Log" },
  { href: ROUTES.ADMIN.USERS, icon: Users, label: "Users" },
  { href: ROUTES.ADMIN.CHECKLIST, icon: CheckSquare, label: "Checklist" },
  { href: ROUTES.ADMIN.PROFILE, icon: User, label: "Profile" },
]

export function EchSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const isAdmin = user?.role === "admin"
  const navItems = isAdmin ? ADMIN_NAV : VA_NAV
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      router.push(ROUTES.LOGIN)
    }
  }

  return (
    <aside className="w-64 shrink-0 bg-[#16181C] flex flex-col h-screen fixed left-0 top-0 z-30">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5">
        <div className="w-8 h-8 rounded-full bg-[#E8792E] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">ECH</span>
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate leading-tight">
            Elevated Core
          </p>
          <p className="text-[#F2994A] text-[10px] font-medium uppercase tracking-wider">
            Pipeline Portal
          </p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-[#E8792E] text-white shadow-md"
                    : "text-[#6B7280] hover:text-white hover:bg-white/5",
              )}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" strokeWidth={1.8} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-white/5 space-y-2">
        <div className="px-3 py-2">
          <p className="text-white text-xs font-medium truncate">{user?.name}</p>
          <p className="text-[#6B7280] text-[10px] truncate capitalize">{user?.role}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full justify-start text-[#6B7280] hover:text-white bg-white/5 hover:bg-primary text-center cursor-pointer text-sm gap-3 px-3 disabled:opacity-50"
        >
          {loggingOut ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.8} />
          ) : (
            <LogOut className="w-4 h-4" strokeWidth={1.8} />
          )}
          {loggingOut ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </aside>
  )
}
