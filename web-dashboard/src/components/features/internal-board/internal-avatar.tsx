"use client"

import { avatarColor, cn, getInitials } from "@/lib/utils"

/**
 * Initials avatar for Link Internal Board — same visual language as the
 * messaging module's Avatar (avatarColor/getInitials are generic lib/utils
 * helpers, not SMS-specific) but its own component so this feature never
 * imports from components/features/messaging.
 */
export function InternalAvatar({
  name,
  colorKey,
  avatarUrl,
  size = "md",
}: {
  name: string
  colorKey: string
  avatarUrl?: string | null
  size?: "xs" | "sm" | "md" | "lg"
}) {
  const color = avatarColor(colorKey)
  const sizeClasses = cn(
    "rounded-full flex items-center justify-center font-bold shrink-0 overflow-hidden ring-2 ring-white",
    size === "xs" && "w-6 h-6 text-[9px]",
    size === "sm" && "w-8 h-8 text-[11px]",
    size === "md" && "w-10 h-10 text-xs",
    size === "lg" && "w-16 h-16 text-lg",
  )

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote per-user avatar, not worth next/image config here
      <img src={avatarUrl} alt={name} className={cn(sizeClasses, "object-cover")} />
    )
  }

  return <div className={cn(sizeClasses, color.bg, color.text)}>{getInitials(name)}</div>
}
