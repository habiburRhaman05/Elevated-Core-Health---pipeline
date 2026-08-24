"use client"

import { avatarColor, cn, getInitials } from "@/lib/utils"

/**
 * Initials avatar with a stable per-key tint. Lives in its own file (rather
 * than beside the inbox that first used it) so the contact panel can import
 * it without creating a circular import back into messaging-inbox.tsx.
 */
export function Avatar({
  name,
  colorKey,
  size = "md",
}: {
  name: string
  colorKey: string
  size?: "sm" | "md" | "lg"
}) {
  const color = avatarColor(colorKey)
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold shrink-0",
        color.bg,
        color.text,
        size === "sm" && "w-8 h-8 text-[11px]",
        size === "md" && "w-9 h-9 text-xs",
        size === "lg" && "w-16 h-16 text-lg",
      )}
    >
      {getInitials(name)}
    </div>
  )
}
