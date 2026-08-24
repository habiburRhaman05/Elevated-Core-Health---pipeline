"use client"

import { useMemo, useState } from "react"
import {
  Building2,
  Eye,
  Inbox,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { avatarColor, cn } from "@/lib/utils"
import { usePatient, usePatients, useAddNote, useDeleteNote } from "@/hooks/query/usePatients"
import { useLinkConversationPatient, useMessagingNumbers } from "@/hooks/query/useMessaging"
import { Avatar } from "./avatar"
import type { SmsConversation } from "@/types"

interface ConversationContactPanelProps {
  conversation: SmsConversation
}

/**
 * Right-hand contact panel for the standalone /messages page only - the
 * patient modal's Messages tab deliberately does NOT render this (it already
 * has the whole patient record around it).
 *
 * Most rows here are intentionally cosmetic: the client asked for a visual
 * match to the reference CRM contact card rather than a patient-specific
 * summary, so Company/Role/Email/Creator/Access are static placeholders even
 * though this app holds some of that data elsewhere. Two things are real -
 * Phone, and Notes (the same patient_notes records the patient modal's Notes
 * tab reads and writes, never a parallel store).
 */
export function ConversationContactPanel({ conversation }: ConversationContactPanelProps) {
  const isLinked = !!conversation.patientId
  const displayName = conversation.patient?.name || conversation.phoneNumber

  // Which of our business numbers this thread belongs to - shown regardless
  // of patient-link state, since it's about the conversation, not the patient.
  const { data: numbersData } = useMessagingNumbers()
  const owningNumber = (numbersData?.numbers ?? []).find((n) => n.phoneNumberId === conversation.quoPhoneNumberId)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-brand">
      {/* Header */}
      <div className="flex flex-col items-center text-center px-4 pt-5 pb-4">
        {isLinked ? (
          <Avatar name={displayName} colorKey={conversation.id} size="lg" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center">
            <UserRound className="w-7 h-7" />
          </div>
        )}
        <p className="mt-3 text-base font-bold text-[#111827] break-words w-full">
          {isLinked ? displayName : conversation.phoneNumber}
        </p>
        {!isLinked && <p className="mt-1 text-xs text-[#9CA3AF]">Not linked to a patient</p>}

        {owningNumber && (
          <span
            title={`This thread is on our ${owningNumber.formattedNumber} business line`}
            className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-semibold text-[#374151]"
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", avatarColor(owningNumber.phoneNumberId).bg)} />
            <Inbox className="w-3 h-3 text-[#9CA3AF]" />
            {owningNumber.formattedNumber}
          </span>
        )}

        {isLinked && (
          <div className="flex items-center gap-2 mt-3">
            <QuickAction icon={Phone} label="Call" />
            <QuickAction icon={MessageSquare} label="Message" />
            <QuickAction icon={MoreHorizontal} label="More" />
          </div>
        )}
      </div>

      {isLinked ? (
        <>
          {/* Tasks - decorative only, this app has no patient task system */}
          <Section title="Tasks">
            <button
              type="button"
              onClick={() => toast.info("Tasks - coming soon")}
              title="Tasks - coming soon"
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-dashed border-gray-200 text-xs text-[#9CA3AF] hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create new task...
            </button>
          </Section>

          <Section title="Contact">
            <FieldRow icon={Building2} label="Company" value={null} placeholder="Set a company" />
            <FieldRow icon={UserRound} label="Role" value={null} placeholder="Set a role" />
            <FieldRow icon={Phone} label="Phone" value={conversation.phoneNumber} />
            <FieldRow icon={Mail} label="Email" value={null} placeholder="Set an email" />
            <FieldRow icon={UserRound} label="Creator" value={null} placeholder="-" />
            <FieldRow icon={Eye} label="Access" value="Everyone" />
          </Section>

          <NotesSection patientId={conversation.patientId as string} />
        </>
      ) : (
        <LinkPatientSection conversation={conversation} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Notes - the SAME records as the patient modal's Notes tab           */
/* ------------------------------------------------------------------ */

function NotesSection({ patientId }: { patientId: string }) {
  // Same query the patient modal reads notes from, so a note added here shows
  // up there (and vice versa) with no second source of truth.
  const { data: patient, isLoading } = usePatient(patientId)
  const addNote = useAddNote()
  const deleteNote = useDeleteNote()
  const [draft, setDraft] = useState("")

  const notes = patient?.patientNotes ?? []

  const handleAdd = () => {
    const content = draft.trim()
    if (!content || addNote.isPending) return
    setDraft("")
    addNote.mutate({ id: patientId, content })
  }

  return (
    <Section title={`Notes ${notes.length > 0 ? notes.length : ""}`.trim()}>
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="Write a note..."
          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draft.trim() || addNote.isPending}
          title="Add note"
          className="p-1.5 rounded-lg bg-[#036638] text-white disabled:opacity-40 disabled:pointer-events-none hover:bg-[#025030] transition-colors shrink-0"
        >
          {addNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#036638]" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-[11px] text-[#9CA3AF] italic py-1">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2">
              <div className="flex items-start justify-between gap-1">
                <span className="text-[10px] font-semibold text-[#374151] truncate">
                  {note.createdByUser?.name ?? "Unknown"}
                </span>
                <button
                  type="button"
                  onClick={() => deleteNote.mutate({ id: patientId, noteId: note.id })}
                  title="Delete note"
                  className="p-0.5 rounded text-gray-400 hover:text-[#CC3333] hover:bg-[#CC3333]/10 transition-colors shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <p className="text-xs text-[#111827] mt-0.5 whitespace-pre-wrap break-words">{note.content}</p>
              <p className="text-[10px] text-[#9CA3AF] mt-1">{new Date(note.createdAt).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Unmatched - link this number to a patient                           */
/* ------------------------------------------------------------------ */

function LinkPatientSection({ conversation }: { conversation: SmsConversation }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // Reuses the board's already-cached patient list (and its server-side role
  // scoping) rather than adding a second patient-search endpoint.
  const { data: patients, isLoading } = usePatients(undefined, { enabled: open })
  const linkPatient = useLinkConversationPatient()

  const results = useMemo(() => {
    const list = patients ?? []
    const q = query.trim().toLowerCase()
    const filtered = q
      ? list.filter(
          (p) => p.name?.toLowerCase().includes(q) || (p.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "")),
        )
      : list
    return filtered.slice(0, 40)
  }, [patients, query])

  return (
    <div className="px-4 py-3 border-t border-gray-100">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#036638] text-white text-xs font-semibold hover:bg-[#025030] transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />
          Link to patient
        </button>
      ) : (
        <div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patients..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>

          <div className="mt-2 max-h-[260px] overflow-y-auto scrollbar-brand border border-gray-100 rounded-lg divide-y divide-gray-50">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-[#036638]" />
              </div>
            ) : results.length === 0 ? (
              <p className="text-[11px] text-[#9CA3AF] italic text-center py-4">No patients found</p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={linkPatient.isPending}
                  onClick={() =>
                    linkPatient.mutate(
                      { conversationId: conversation.id, patientId: p.id },
                      { onSuccess: () => setOpen(false) },
                    )
                  }
                  className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Avatar name={p.name} colorKey={p.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#111827] truncate">{p.name}</p>
                    <p className="text-[10px] text-[#6B7280] truncate">{p.phone || "No phone on file"}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6B7280] hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-t border-gray-100">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-2">{title}</p>
      {children}
    </div>
  )
}

function QuickAction({ icon: Icon, label }: { icon: typeof Phone; label: string }) {
  return (
    <button
      type="button"
      title={`${label} - coming soon`}
      onClick={() => toast.info(`${label} - coming soon`)}
      aria-label={`${label} (coming soon)`}
      className="w-9 h-9 rounded-full bg-gray-100 text-[#6B7280] hover:bg-[#036638]/10 hover:text-[#036638] flex items-center justify-center transition-colors"
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

function FieldRow({
  icon: Icon,
  label,
  value,
  placeholder,
}: {
  icon: typeof Phone
  label: string
  value: string | null
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
      <span className="text-xs text-[#6B7280] w-[68px] shrink-0">{label}</span>
      <span className={cn("text-xs truncate", value ? "text-[#111827] font-medium" : "text-[#C0C4CC]")}>
        {value ?? placeholder ?? "-"}
      </span>
    </div>
  )
}
