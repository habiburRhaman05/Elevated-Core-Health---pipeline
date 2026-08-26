"use client"

import { InternalBoard } from "@/components/features/internal-board/internal-board"

export default function VAInternalMessagingPage() {
  return (
    <div className="flex flex-col h-full overflow-x-hidden lg:h-[calc(100vh-7.5rem)] lg:overflow-hidden">
      <div className="flex-1 min-h-0">
        <InternalBoard />
      </div>
    </div>
  )
}
