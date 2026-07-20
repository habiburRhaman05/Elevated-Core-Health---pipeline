"use client"

import { EchSidebar } from "@/components/layouts/ech-sidebar"
import { StatusBar } from "@/components/features/status-bar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-[#F4F5F7]">
      <EchSidebar />
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
       
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
