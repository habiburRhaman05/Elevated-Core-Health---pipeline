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
  ChevronLeft,
  ChevronRight,
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

interface EchSidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export function EchSidebar({ isCollapsed, setIsCollapsed }: EchSidebarProps) {
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
    <aside className={cn(
      "shrink-0 bg-[#16181C] flex flex-col h-screen fixed left-0 top-0 z-30 transition-all duration-300",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn(
        "flex items-center h-16 border-b border-white/5 px-5 relative",
        isCollapsed ? "justify-center" : "gap-3"
      )}>
        <div className="w-8 h-8 rounded-full bg-[#E8792E] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">ECH</span>
        </div>
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-semibold truncate leading-tight">
              Elevated Core
            </p>
            <p className="text-[#F2994A] text-[10px] font-medium uppercase tracking-wider">
              Pipeline Portal
            </p>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#2D3139] border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3E434D] transition-colors z-40"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-all duration-150",
                isCollapsed ? "justify-center px-0 py-3" : "px-3 py-2.5 gap-3",
                isActive
                  ? "bg-[#E8792E] text-white shadow-md"
                  : "text-[#9CA3AF] hover:text-white hover:bg-white/5",
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={1.8} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/5 bg-[#0F1115]">
        <div className={cn(
          "flex items-center gap-3 mb-4",
          isCollapsed ? "justify-center" : ""
        )}>
          <div className="w-9 h-9 rounded-full bg-[#374151] flex items-center justify-center flex-shrink-0 border border-white/10">
            <span className="text-white text-sm font-semibold">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <p className="text-gray-200 text-sm font-semibold truncate leading-tight">{user?.name}</p>
              <p className="text-[#9CA3AF] text-[11px] truncate capitalize font-medium tracking-wide mt-0.5">{user?.role}</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          disabled={loggingOut}
          className={cn(
            "w-full bg-[#1F2937] hover:bg-[#374151] text-gray-300 hover:text-white border border-white/5 disabled:opacity-50 transition-colors h-9",
            isCollapsed ? "px-0 justify-center" : "justify-start px-3 gap-2"
          )}
          title={isCollapsed ? "Sign out" : undefined}
        >
          {loggingOut ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
          ) : (
            <LogOut className="w-4 h-4" strokeWidth={2} />
          )}
          {!isCollapsed && (
            <span className="text-sm font-medium">{loggingOut ? "Signing out..." : "Sign out"}</span>
          )}
        </Button>
      </div>
    </aside>
  )
}
