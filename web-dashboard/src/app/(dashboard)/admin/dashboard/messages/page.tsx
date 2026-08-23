"use client"

import { MessagingInbox } from "@/components/features/messaging/messaging-inbox"

export default function AdminMessagesPage() {
  return (
    <div className="flex flex-col h-full overflow-x-hidden lg:h-[calc(100vh-7.5rem)] lg:overflow-hidden">
      <div className="flex-1 min-h-0">
        <MessagingInbox />
      </div>
    </div>
  )
}
