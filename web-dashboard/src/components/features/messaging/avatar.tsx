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
  useLogo,
}: {
  name: string
  colorKey: string
  size?: "sm" | "md" | "lg"
  /**
   * Renders the Elevated Core Health logo instead of initials — for a
   * message with no identifiable local sender (sent straight from the Quo
   * dashboard by clinic staff, outside this app), a lettered initial like
   * "Y" is misleading since it isn't actually attributable to a person here.
   */
  useLogo?: boolean
}) {
  const color = avatarColor(colorKey)
  const sizeClasses = cn(
    "rounded-full flex items-center justify-center font-bold shrink-0",
    size === "sm" && "w-8 h-8 text-[11px]",
    size === "md" && "w-9 h-9 text-xs",
    size === "lg" && "w-16 h-16 text-lg",
  )

  if (useLogo) {
    return (
      <div className={cn(sizeClasses, "bg-[#EBF7EC] p-1.5")} title="Sent from the Quo dashboard">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand asset, not worth next/image config here */}
        <img src="/logo.png" alt="Elevated Core Health" className="w-full h-full object-contain" />
      </div>
    )
  }

  return (
    <div className={cn(sizeClasses, color.bg, color.text)}>
      {getInitials(name)}
    </div>
  )
}
