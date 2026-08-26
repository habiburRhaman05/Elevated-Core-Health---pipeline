"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Smile } from "lucide-react"
import { cn } from "@/lib/utils"

// A compact, commonly-used set — enough for real chat use without pulling in
// a full emoji-data package just for this composer.
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: ["😀", "😁", "😂", "🤣", "😊", "😉", "😍", "😘", "😎", "🤔", "😐", "😴", "😢", "😭", "😡", "🥳"],
  },
  {
    label: "Gestures",
    emojis: ["👍", "👎", "👏", "🙌", "🙏", "💪", "👋", "✌️", "🤝", "👌", "🤞", "✋"],
  },
  {
    label: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "💯", "✨", "🔥", "⭐"],
  },
  {
    label: "Objects",
    emojis: ["🎉", "🎊", "✅", "❌", "⚠️", "📌", "📎", "📅", "⏰", "☕", "🚀", "💡"],
  },
]

interface InternalEmojiPickerProps {
  disabled?: boolean
  onSelect: (emoji: string) => void
}

/** Emoji button + popover for the composer — click an emoji to insert it at
 *  the draft's caret position (handled by the caller, see InternalComposer's
 *  insertEmoji). Own tiny curated set rather than a dependency, matching
 *  this feature's "no external UI deps beyond what's already installed"
 *  approach elsewhere (attachment picker, avatar, ...). */
export function InternalEmojiPicker({ disabled, onSelect }: InternalEmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Emoji"
        aria-label="Insert emoji"
        className={cn(
          "p-1.5 rounded-lg text-[#6B7280] hover:text-[#036638] hover:bg-[#036638]/8 transition-colors disabled:opacity-40 disabled:pointer-events-none",
          open && "text-[#036638] bg-[#036638]/8",
        )}
      >
        <Smile className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-[260px] max-h-[280px] overflow-y-auto scrollbar-brand bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2.5"
          >
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF] px-1 mb-1">{group.label}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onSelect(emoji)
                        setOpen(false)
                      }}
                      className="w-7 h-7 flex items-center justify-center text-base rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
