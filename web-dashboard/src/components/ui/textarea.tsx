import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#1A1B1E] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#E8792E]/30 focus:border-[#E8792E] disabled:cursor-not-allowed disabled:opacity-50 transition-all",
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
