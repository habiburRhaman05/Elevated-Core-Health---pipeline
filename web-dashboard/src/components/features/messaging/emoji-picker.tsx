"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Smile } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Small hand-rolled emoji picker. No emoji library is installed in this app
 * and this only needs to cover the common cases a VA would use in a patient
 * SMS, so a static list beats adding a dependency (and its bundle weight)
 * for a nice-to-have.
 */
interface EmojiEntry {
  char: string
  keywords: string
}

const SMILEYS_AND_PEOPLE: EmojiEntry[] = [
  { char: "😀", keywords: "grin smile happy" },
  { char: "😃", keywords: "smile happy joy" },
  { char: "😄", keywords: "smile happy laugh" },
  { char: "😁", keywords: "grin beam happy" },
  { char: "😆", keywords: "laugh satisfied" },
  { char: "😅", keywords: "sweat laugh relief" },
  { char: "😂", keywords: "joy laugh tears cry" },
  { char: "🙂", keywords: "slight smile" },
  { char: "🙃", keywords: "upside down silly" },
  { char: "😉", keywords: "wink" },
  { char: "😊", keywords: "blush smile happy" },
  { char: "😇", keywords: "innocent halo angel" },
  { char: "😍", keywords: "heart eyes love" },
  { char: "😘", keywords: "kiss" },
  { char: "😋", keywords: "yum tasty" },
  { char: "😎", keywords: "cool sunglasses" },
  { char: "🤗", keywords: "hug" },
  { char: "🤔", keywords: "think hmm" },
  { char: "😐", keywords: "neutral" },
  { char: "😴", keywords: "sleep tired" },
  { char: "😌", keywords: "relieved calm" },
  { char: "😔", keywords: "sad pensive" },
  { char: "😢", keywords: "cry sad tear" },
  { char: "😭", keywords: "sob cry loud" },
  { char: "😅", keywords: "nervous sweat" },
  { char: "😳", keywords: "flushed surprise" },
  { char: "😬", keywords: "grimace awkward" },
  { char: "🙄", keywords: "eye roll" },
  { char: "😷", keywords: "mask sick" },
  { char: "🤒", keywords: "sick thermometer fever" },
  { char: "🤕", keywords: "hurt injury bandage" },
  { char: "🤧", keywords: "sneeze sick" },
  { char: "😇", keywords: "angel" },
  { char: "🥳", keywords: "party celebrate" },
  { char: "😀", keywords: "smile" },
  { char: "👍", keywords: "thumbs up yes good ok" },
  { char: "👎", keywords: "thumbs down no bad" },
  { char: "👋", keywords: "wave hello hi bye" },
  { char: "🙏", keywords: "please thanks pray" },
  { char: "👏", keywords: "clap applause" },
  { char: "🤝", keywords: "handshake deal" },
  { char: "💪", keywords: "strong muscle" },
  { char: "🙌", keywords: "celebrate raise hands" },
  { char: "✌️", keywords: "peace victory" },
  { char: "👌", keywords: "ok perfect" },
  { char: "🤞", keywords: "fingers crossed luck" },
  { char: "❤️", keywords: "heart love red" },
  { char: "💚", keywords: "green heart" },
  { char: "✨", keywords: "sparkles shine" },
  { char: "🎉", keywords: "party tada celebrate" },
  { char: "🔥", keywords: "fire hot" },
  { char: "⭐", keywords: "star" },
  { char: "✅", keywords: "check done complete yes" },
  { char: "❌", keywords: "cross no wrong" },
  { char: "⚠️", keywords: "warning caution" },
  { char: "📅", keywords: "calendar date appointment" },
  { char: "⏰", keywords: "clock alarm time reminder" },
  { char: "📞", keywords: "phone call" },
  { char: "📱", keywords: "mobile phone cell" },
  { char: "📧", keywords: "email mail" },
  { char: "💊", keywords: "pill medicine medication" },
  { char: "🩺", keywords: "stethoscope doctor medical" },
  { char: "🏥", keywords: "hospital clinic" },
  { char: "📋", keywords: "clipboard chart notes" },
]

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  disabled?: boolean
}

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  // Stays open across multiple picks (typical chat behavior) - only an
  // outside click or Escape closes it.
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SMILEYS_AND_PEOPLE
    return SMILEYS_AND_PEOPLE.filter((e) => e.keywords.includes(q))
  }, [query])

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

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[300px] bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Emoji..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
              />
            </div>
          </div>
          <div className="max-h-[220px] overflow-y-auto scrollbar-brand p-2">
            <p className="text-[11px] font-bold text-[#6B7280] px-1 pb-1.5">Smileys &amp; People</p>
            {filtered.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] italic px-1 py-3 text-center">No emoji found</p>
            ) : (
              <div className="grid grid-cols-8 gap-0.5">
                {filtered.map((entry, i) => (
                  <button
                    key={`${entry.char}-${i}`}
                    type="button"
                    onClick={() => onSelect(entry.char)}
                    title={entry.keywords.split(" ")[0]}
                    className="w-8 h-8 flex items-center justify-center text-lg rounded-md hover:bg-gray-100 transition-colors"
                  >
                    {entry.char}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
