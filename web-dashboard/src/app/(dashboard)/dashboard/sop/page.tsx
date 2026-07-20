"use client"

import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_HINTS,
} from "@/types"
import { ScrollText, CheckCircle, AlertTriangle, Flag } from "lucide-react"

const CHECKLISTS: Record<string, string[]> = {
  onboarding: [
    "Confirm appointment on calendar",
    "Send intake paperwork",
    "Verify insurance eligibility",
  ],
  visit_complete: [
    "Mark encounter as finished in Optimantra",
    "Collect any outstanding patient paperwork",
  ],
  post_visit_docs: [
    "Send patient instruction letter",
    "Send lab orders (if applicable)",
    "Document all communications in Optimantra",
  ],
  chart_signed: [
    "Verify Optimantra note is signed",
    "CPT level check — appropriate for services rendered",
    "ICD-10 alignment — codes match documentation",
    "Documentation support check — all billed services documented",
  ],
  sent_to_billing: [
    "Claim submitted to correct payer (Headway / Grow Therapy / self-pay)",
    "Confirm claim accepted by clearinghouse",
    "Record claim reference number",
  ],
  payment_posted: [
    "Verify payment amount matches expected reimbursement",
    "Post payment to patient account",
    "Update payment status in tracking system",
  ],
  reconciled: [
    "Compare payment to billed amount",
    "Resolve any discrepancies",
    "Close out patient record in pipeline",
    "Archive all operational notes",
  ],
}

export default function SOPPage() {
  return (
    <div className="space-y-6  max-w-[1600px] mx-auto pb-12">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <ScrollText className="w-5 h-5 text-[#E8792E]" />
          <h1 className="text-xl font-bold text-[#1A1B1E]">
            SOP Reference
          </h1>
        </div>
        <p className="text-sm text-[#6B7280]">
          Standard operating procedures for the patient pipeline
        </p>
      </div>

      {/* Key Rules */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 space-y-3">
        <h2 className="text-sm font-bold text-[#E8792E]">Key Rules</h2>
        <div className="space-y-2">
          <div className="flex items-start gap-2.5">
            <CheckCircle className="w-4 h-4 text-[#F2994A] mt-0.5 shrink-0" />
            <p className="text-sm text-[#374151]">
              <strong>Forward moves are checklist-gated.</strong> A patient cannot advance
              until every checklist item for the current stage is checked. Backward moves
              are always allowed.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-[#374151]">
              <strong>Stale flag (48h).</strong> If a card hasn&apos;t been updated in 48+
              hours and is not in <strong>Reconciled</strong>, it gets flagged visually.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <Flag className="w-4 h-4 text-[#E8792E] mt-0.5 shrink-0" />
            <p className="text-sm text-[#374151]">
              <strong>Flag for Donna.</strong> Any VA can flag a card with a text reason.
              Only Donna can clear flags. Use this for issues needing her attention.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle className="w-4 h-4 text-[#F2994A] mt-0.5 shrink-0" />
            <p className="text-sm text-[#374151]">
              <strong>No clinical data.</strong> Notes fields are for operational status
              only — never diagnoses or clinical details.
            </p>
          </div>
        </div>
      </div>

      {/* Stage Checklists */}
      {STAGE_ORDER.map((stage) => (
        <div key={stage} className="bg-white rounded-xl border border-[#E5E7EB] p-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-[#E8792E]">
              {STAGE_LABELS[stage]}
            </h3>
            <p className="text-xs text-[#6B7280]">{STAGE_HINTS[stage]}</p>
          </div>
          <ul className="space-y-1.5">
            {CHECKLISTS[stage]?.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-[#374151]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F2994A] mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
