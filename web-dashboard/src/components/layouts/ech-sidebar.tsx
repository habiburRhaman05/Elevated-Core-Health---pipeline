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
  Settings,
  Contact,
  ScrollText,
  ShieldCheck,
  BarChart3,
  LogOut,
  User,
  Loader2,
  ChevronLeft,
  RulerIcon,
  ChevronRight,
  CalendarDays,
  X,
  NotebookText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/constants"
import { useAuth } from "@/hooks/auth/useAuth"
import { isAdminOrAbove, roleLabel } from "@/lib/roles"

const VA_NAV = [
  { section: "Main", items: [
    { href: ROUTES.DASHBOARD.HOME, icon: LayoutDashboard, label: "Dashboard" },
    { href: ROUTES.DASHBOARD.BOARD, icon: Columns3, label: "Pipeline Board" },
  ]},
  { section: "Operations", items: [
    { href: ROUTES.DASHBOARD.WORKLOAD, icon: CalendarDays, label: "Workload" },
    { href: ROUTES.DASHBOARD.LOG, icon: ClipboardList, label: "Activity Log" },
    { href: ROUTES.DASHBOARD.REPORTING, icon: BarChart3, label: "My Report" },
  ]},
  { section: "Reference", items: [
    { href: ROUTES.DASHBOARD.SOP, icon: ScrollText, label: "SOP Guide" },
  ]},
]

const ADMIN_NAV = [
  { section: "Main", items: [
    { href: ROUTES.ADMIN.HOME, icon: LayoutDashboard, label: "Dashboard" },
    { href: ROUTES.ADMIN.BOARD, icon: Columns3, label: "Pipeline Board" },
  ]},
  { section: "Operations", items: [
    { href: ROUTES.ADMIN.WORKLOAD, icon: CalendarDays, label: "Workload" },
    { href: ROUTES.ADMIN.LOG, icon: ClipboardList, label: "Activity Log" },
    { href: ROUTES.ADMIN.REPORTING, icon: BarChart3, label: "Reporting" },
  ]},
  { section: "Management", items: [
    { href: ROUTES.ADMIN.USERS, icon: Users, label: "Users" },
    { href: ROUTES.ADMIN.CRM, icon: Contact, label: "CRM Integration" },
    { href: ROUTES.ADMIN.ELIGIBILITY, icon: ShieldCheck, label: "Eligibility" },
  ]},
  { section: "Configuration", items: [
    // { href: ROUTES.ADMIN.APP_SETTINGS, icon: Settings, label: "App Settings" },
    { href: ROUTES.ADMIN.SOP, icon: NotebookText, label: "Sop Guide" },
  ]},
]

interface EchSidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  /** Passed only by the mobile drawer instance — renders an explicit close (X) button. */
  onMobileClose?: () => void;
}

export function EchSidebar({ isCollapsed, setIsCollapsed, onMobileClose }: EchSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const isAdmin = isAdminOrAbove(user?.role)
  const navItems = isAdmin ? ADMIN_NAV : VA_NAV
  const profileRoute = isAdmin ? ROUTES.ADMIN.PROFILE : ROUTES.DASHBOARD.PROFILE
  const isProfileActive = pathname === profileRoute
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
      "shrink-0 bg-[#F0F6F2] flex flex-col h-screen fixed left-0 top-0 z-30 transition-all duration-300 border-r border-[#036638]/15 shadow-[4px_0_24px_rgba(3,102,56,0.08)]",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn(
        "flex items-center justify-between border-b border-[#036638]/10 relative transition-all duration-300 px-3",
        isCollapsed ? "h-20 w-20" : "h-20 w-64"
      )}>
        <div className={cn(
          "flex items-center transition-all duration-300",
          isCollapsed ? "justify-center w-full" : "justify-start gap-3 w-full"
        )}>
          {/* Logo */}
          <div className={cn(
            "flex-shrink-0 flex items-center justify-center transition-all duration-300",
            isCollapsed ? "w-16 h-16" : "w-16 h-16"
          )}>
            <img
              src="/logo.png"
              alt="Elevated Core Health"
              width={isCollapsed ? 64 : 64}
              className="w-16 h-16 object-contain"
            />
          </div>

          {/* Text */}
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-white text-[12px] font-bold tracking-tight leading-tight">Elevated Health</p>
              <p className="text-[#65BD6C] text-[8px] font-semibold uppercase tracking-widest leading-tight mt-0.5">Care Dashboard</p>
            </div>
          )}
        </div>        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#E5E7EB] border border-[#036638]/20 rounded-full items-center justify-center text-[#374151] hover:text-[#036638] hover:bg-[#D1FAE5] transition-colors z-40 hidden lg:flex"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            aria-label="Close menu"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-[#374151] hover:text-[#036638] hover:bg-[#036638]/10 active:bg-[#036638]/15 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 py-4 px-3 space-y-6 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {navItems.map((section) => (
          <div key={section.section} className="space-y-2">
            {/* Section Header */}
            {!isCollapsed && (
              <h3 className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[#036638]/60 transition-all duration-200">
                {section.section}
              </h3>
            )}

            {/* Section Items */}
            <div className="space-y-1.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-all duration-200 group",
                      isCollapsed ? "justify-center px-0 py-2.5" : "px-3 py-2 gap-3",
                      isActive
                        ? "bg-[#036638] text-white shadow-[0_2px_8px_rgba(3,102,56,0.2)] border border-[#036638]"
                        : "text-[#374151] hover:text-[#036638] hover:bg-[#036638]/8 border border-transparent hover:border-[#036638]/15",
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon
                      className={cn(
                        "w-5 h-5 flex-shrink-0 transition-all duration-200",
                        isActive ? "text-white" : "text-[#036638] group-hover:scale-110"
                      )}
                      strokeWidth={1.8}
                    />
                    {!isCollapsed && (
                      <span className="group-hover:translate-x-0.5 transition-transform duration-200">
                        {item.label}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[#036638]/10 space-y-3">
        {/* Profile Card */}
        <Link
          href={profileRoute}
          title={isCollapsed ? "View profile" : undefined}
          className={cn(
            "flex items-center rounded-lg transition-all duration-200 group",
            isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-2.5 py-2.5 border",
            isProfileActive
              ? "bg-[#036638]/10 border-[#036638]/30"
              : "border-[#036638]/10 hover:border-[#036638]/25 hover:bg-[#036638]/5",
          )}
        >
          <div className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border font-semibold transition-all duration-200 overflow-hidden",
            isProfileActive
              ? "bg-[#036638] text-white border-[#036638]"
              : "bg-[#036638]/10 text-[#036638] border-[#036638]/20 group-hover:border-[#036638]/50",
          )}>
            {user?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote avatar, no static optimization needed
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0).toUpperCase() || "U"
            )}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-[#111827] text-sm font-semibold truncate leading-tight">
                {user?.name}
              </p>
              <p className="text-[#036638]/70 text-[10px] truncate uppercase font-bold tracking-wide mt-1">
                {roleLabel(user?.role)}
              </p>
            </div>
          )}
        </Link>

        {/* Logout Button */}
        <Button
          onClick={handleLogout}
          disabled={loggingOut}
          className={cn(
            "w-full h-8 text-xs font-medium transition-all duration-200 border",
            isCollapsed
              ? "px-0 justify-center bg-red-50 text-red-600 hover:bg-red-100 border-red-200 hover:text-red-700"
              : "justify-start gap-2.5 px-2.5 bg-red-50 text-red-600 hover:bg-red-100 border-red-200 hover:text-red-700",
          )}
          title={isCollapsed ? "Sign out" : undefined}
        >
          {loggingOut ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
              {!isCollapsed && <span>Signing out...</span>}
            </>
          ) : (
            <>
              <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
              {!isCollapsed && <span>Sign out</span>}
            </>
          )}
        </Button>
      </div>

      
    </aside>
  )
}
