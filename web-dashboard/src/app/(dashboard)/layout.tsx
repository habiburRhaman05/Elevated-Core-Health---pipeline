"use client"

import { useState } from "react"
import { EchSidebar } from "@/components/layouts/ech-sidebar"
import { StatusBar } from "@/components/features/status-bar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen bg-[#F4F5F7]">
      <EchSidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <div className={`flex-1 transition-all duration-300 flex flex-col min-h-screen ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
