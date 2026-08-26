"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Columns3,
  Contact,
  BarChart3,
  ClipboardList,
  EllipsisVertical,
  CalendarDays,
  ScrollText,
  Upload,
  User,
  Users,
  Settings,
  ShieldCheck,
  Wrench,
  Link2,
} from "lucide-react"
import { ROUTES } from "@/constants"
import { useAuth } from "@/hooks/auth/useAuth"
import { isAdminOrAbove } from "@/lib/roles"
import { cn } from "@/lib/utils"

interface TabItem {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  href: string
}

function useTabs(): TabItem[] {
  const { user } = useAuth()
  const isAdmin = isAdminOrAbove(user?.role)
  const base = isAdmin ? ROUTES.ADMIN : ROUTES.DASHBOARD
  return [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: base.HOME },
    { key: "board", label: "Board", icon: Columns3, href: base.BOARD },
    { key: "patients", label: "Patients", icon: Contact, href: isAdmin ? ROUTES.ADMIN.CRM : ROUTES.DASHBOARD.PATIENTS },
    { key: "reporting", label: "Reporting", icon: BarChart3, href: base.REPORTING },
    { key: "activity", label: "Activity", icon: ClipboardList, href: base.LOG },
  ]
}

interface MoreItem {
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  href: string
}

function useMoreItems(): MoreItem[] {
  const { user } = useAuth()
  const isAdmin = isAdminOrAbove(user?.role)
  const base = isAdmin ? ROUTES.ADMIN : ROUTES.DASHBOARD
  const items: MoreItem[] = [
    { label: "Link Internal Board", icon: Link2, href: base.INTERNAL_MESSAGING },
    { label: "Workload", icon: CalendarDays, href: base.WORKLOAD },
    { label: "SOP Guide", icon: ScrollText, href: base.SOP },
    { label: "Import", icon: Upload, href: base.IMPORT },
  ]
  if (isAdmin) {
    items.push(
      { label: "Users", icon: Users, href: ROUTES.ADMIN.USERS },
      { label: "Stage Settings", icon: Settings, href: ROUTES.ADMIN.STAGES },
      { label: "Eligibility", icon: ShieldCheck, href: ROUTES.ADMIN.ELIGIBILITY },
      { label: "App Settings", icon: Wrench, href: ROUTES.ADMIN.APP_SETTINGS },
    )
  }
  items.push({ label: "Profile", icon: User, href: isAdmin ? ROUTES.ADMIN.PROFILE : ROUTES.DASHBOARD.PROFILE })
  return items
}

/**
 * Phone-only bottom navigation (lg:hidden) — floating frosted pill bar with
 * five icon+label tabs and a compact 3-dot (⋯) icon button on the right that
 * opens the secondary-page menu. Active tab: white icon in a green gradient
 * tile with a soft glow + green label; inactive: grey.
 */
export function MobileBottomNav() {
  const pathname = usePathname()
  const tabs = useTabs()
  const moreItems = useMoreItems()
  const [moreOpen, setMoreOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const lastScrollY = useRef(0)

  // Exact match only — startsWith would mark Dashboard active on every
  // /dashboard/* route (board, log, reporting…). Same rule the sidebar uses.
  const isActive = (href: string) => pathname === href

  // Close the more-menu (and always reshow the bar) on route change.
  useEffect(() => {
    setMoreOpen(false)
    setHidden(false)
    lastScrollY.current = 0
  }, [pathname])

  // Auto-hide on scroll-down (past 300px), reveal on scroll-up, and re-show
  // after a moment of no scrolling. Different screens scroll different
  // elements: the page body on most pages, but the kanban board scrolls in
  // its own inner containers (overflow-y-auto columns). So we listen in the
  // CAPTURE phase (scroll events don't bubble) and read the scrollTop of
  // whichever element actually scrolled, falling back to window.scrollY.
  useEffect(() => {
    const HIDE_AFTER_PX = 300
    const IDLE_MS = 1200
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const clearIdle = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }

    const onScroll = (e: Event) => {
      const target = e.target
      const currentY =
        target instanceof HTMLElement ? target.scrollTop : window.scrollY
      const diff = currentY - lastScrollY.current
      lastScrollY.current = currentY

      clearIdle()
      idleTimer = setTimeout(() => {
        // Stopped scrolling → bring the bar back (premium feel).
        setHidden(false)
      }, IDLE_MS)

      if (Math.abs(diff) < 6) return
      if (diff > 0 && currentY > HIDE_AFTER_PX) {
        setHidden(true)
        setMoreOpen(false)
      } else if (diff < 0) {
        setHidden(false)
      }
    }

    window.addEventListener("scroll", onScroll, true)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      clearIdle()
    }
  }, [])

  useEffect(() => {
    if (!moreOpen) return
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("touchstart", handlePointerDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("touchstart", handlePointerDown)
    }
  }, [moreOpen])

  return (
    <div
      className={cn(
        "ech-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] transition-all duration-300 ease-out",
        hidden
          ? "translate-y-[calc(100%+0.75rem)] opacity-0 pointer-events-none"
          : "translate-y-0 opacity-100",
      )}
    >
      {/* More menu popover — sits above the bar, anchored right */}
      {moreOpen && (
        <div ref={moreRef} className="absolute right-3 bottom-[calc(100%+0.5rem)] left-3">
          <div className="bg-white rounded-2xl border border-[#E5E7EB]/80 shadow-2xl shadow-black/15 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-2.5 bg-gradient-to-r from-[#036638] to-[#025030]">
              <p className="text-xs font-bold text-white">More</p>
            </div>
            <div className="grid grid-cols-2 gap-1 p-2.5">
              {moreItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-[#EBF7EC] text-[#036638]" : "text-[#374151] hover:bg-[#F9FAFB]",
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* The bar — frosted glass pill: gradient hairline border, inner top
          highlight, soft ambient shadow, strong blur over whatever scrolls
          beneath it. */}
      <div className="relative rounded-[1.85rem] p-[1px] bg-gradient-to-b from-white via-[#E5E7EB]/90 to-white/40 shadow-[0_-4px_24px_rgba(0,0,0,0.05),0_12px_40px_rgba(0,0,0,0.12)]">
        <div className="relative bg-white/55 backdrop-blur-2xl backdrop-saturate-150 rounded-[1.8rem] pl-1 pr-1.5 py-2 flex items-stretch overflow-hidden">
          {/* Inner top highlight — light catches the upper edge of the pill */}
          <span aria-hidden className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
          {/* Soft brand tint drifting behind the frosted surface */}
          <span aria-hidden className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-20 bg-[#65BD6C]/15 blur-3xl rounded-full pointer-events-none" />

        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = isActive(tab.href)
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                "flex-1 min-w-0 flex flex-col items-center justify-center gap-1.5 rounded-2xl py-2 transition-all duration-200",
                active ? "bg-transparent" : "hover:bg-[#F3F4F6] active:scale-95",
              )}
            >
              <Icon
                className={cn("w-[22px] h-[22px]", active ? "text-[#036638]" : "text-[#9CA3AF]")}
                strokeWidth={active ? 2.1 : 1.8}
              />
              <span className="text-[10px] font-semibold tracking-wide leading-none text-[#9CA3AF]">
                {tab.label}
              </span>
            </Link>
          )
        })}

        {/* ⋮ vertical 3-dot icon button — compact, no label */}
        <div className="flex items-center pl-1 border-l border-[#EDEFF2]/80">
          <button
            onClick={() => setMoreOpen((v) => !v)}
            aria-label="More menu"
            aria-expanded={moreOpen}
            className={cn(
              "flex items-center justify-center w-7 h-10 my-auto rounded-lg transition-all duration-200 cursor-pointer",
              moreOpen ? "bg-transparent" : "hover:bg-[#F3F4F6] active:scale-95",
            )}
          >
            <EllipsisVertical
              className={cn("w-5 h-5", moreOpen ? "text-[#036638]" : "text-[#9CA3AF]")}
              strokeWidth={moreOpen ? 2.1 : 1.8}
            />
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
