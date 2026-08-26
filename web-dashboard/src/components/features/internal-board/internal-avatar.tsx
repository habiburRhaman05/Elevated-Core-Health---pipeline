"use client"

import { avatarColor, cn, getInitials } from "@/lib/utils"

const DOT_SIZE: Record<"xs" | "sm" | "md" | "lg", string> = {
  xs: "w-1.5 h-1.5 border",
  sm: "w-2 h-2 border-2",
  md: "w-2.5 h-2.5 border-2",
  lg: "w-3.5 h-3.5 border-2",
}

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
  /** undefined = presence unknown/not tracked here (don't render a dot at all). */
  online,
}: {
  name: string
  colorKey: string
  avatarUrl?: string | null
  size?: "xs" | "sm" | "md" | "lg"
  online?: boolean
}) {
  const color = avatarColor(colorKey)
  const sizeClasses = cn(
    "rounded-full flex items-center justify-center font-bold shrink-0 overflow-hidden ring-2 ring-white",
    size === "xs" && "w-6 h-6 text-[9px]",
    size === "sm" && "w-8 h-8 text-[11px]",
    size === "md" && "w-10 h-10 text-xs",
    size === "lg" && "w-16 h-16 text-lg",
  )

  return (
    <div className="relative shrink-0">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote per-user avatar, not worth next/image config here
        <img src={avatarUrl} alt={name} className={cn(sizeClasses, "object-cover")} />
      ) : (
        <div className={cn(sizeClasses, color.bg, color.text)}>{getInitials(name)}</div>
      )}
      {online !== undefined && (
        <span
          title={online ? "Online" : "Offline"}
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-white",
            DOT_SIZE[size],
            online ? "bg-emerald-400" : "bg-gray-300",
          )}
        />
      )}
    </div>
  )
}
