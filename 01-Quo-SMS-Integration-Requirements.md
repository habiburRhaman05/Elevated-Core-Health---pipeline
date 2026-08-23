# Quo (OpenPhone) SMS Integration — Requirements

**Project:** Elevated Core Health — Patient Pipeline Portal
**Feature:** Two-way SMS messaging synced into the internal dashboard
**Date:** 2026-08-23

---

## 1. Business Goal

Right now, when a patient texts the clinic's business number, VAs have to log into the
Quo (OpenPhone) app/site separately to see and reply to it. This feature brings SMS
directly into the pipeline dashboard so VAs never have to leave the tool they already
work in all day.

---

## 2. Core Requirements

### 2.1 Inbound sync (webhook)
- When a new SMS arrives on the clinic's Quo business number, it must sync into our
  dashboard **immediately** (as close to real-time as the architecture allows).
- Sync happens via a **Quo webhook** hitting our backend — not by polling Quo's API.

### 2.2 Central messaging inbox (dashboard-wide)
- A dedicated "Messages" section in the dashboard, structured like a normal messaging
  app: conversation list on one side, thread view on the other.
- Employees (VAs/admin) can **send SMS replies directly from the dashboard** — no need
  to open Quo separately.
- All conversations tied to the business number are visible here, whether or not
  they're linked to a known patient.

### 2.3 Patient modal — new "Messages" tab
- When a VA opens a **patient details modal**, there must be a new tab (alongside the
  existing Notes/Flags/Activity tabs) showing that specific patient's SMS conversation.
- VA can read the full thread and **send a reply directly from inside the modal**,
  without navigating to the central inbox or to Quo.
- This tab should show only messages tied to that patient's phone number.

### 2.4 "All main features" — scope of a full messaging experience
- Read incoming messages
- Send outgoing messages
- See conversation history in chronological order
- See message status (sent/delivered/failed) where Quo provides it
- Know which conversations have unread messages
- Never lose or drop a message that hits our webhook

---

## 3. Non-Functional / Platform Constraints

| Constraint | Decision |
|---|---|
| Realtime sync method | **Polling** (5–10s refresh interval) — confirmed by client. No WebSocket/Pusher/Ably, since backend runs on Vercel serverless and can't hold persistent connections. |
| Data sensitivity | Patient data in this app is treated as PHI (per project's existing CLAUDE.md rules). SMS content must be handled with the same care — see Risks doc. |
| API key storage | Quo API key lives in environment variables (like existing `RESEND_API_KEY` pattern) — never stored in the database. |
| Existing patterns | Must follow the existing modular structure (`moduels/<feature>/`: controller, router, service, validation) and existing audit-logging conventions already used across the codebase. |

---

## 4. Out of Scope (for this phase)

- MMS / image messages (Quo's API does not currently support sending MMS; inbound MMS
  handling behavior needs to be verified with Quo before it's promised to the client).
- Voice calls, call recordings, transcriptions (Quo supports these via API, but they
  are not part of this request).
- Group messaging.
- Multi-number routing (this phase assumes **one single business number**).

---

## 5. Open Items to Confirm Before/During Build

1. Does Quo sign webhook payloads (HMAC signature) for verification? Needed to secure
   the public webhook endpoint against spoofed requests.
2. Does Quo offer a signed BAA for this Quo workspace, given patient SMS may contain
   PHI-adjacent content?
3. What happens when an inbound message is on a phone number **not matched to any
   patient** in our system (wrong number, referral, spam)? Decision: show it in the
   central inbox under an "Unmatched" bucket rather than dropping it.
4. What happens when **two patients share the same phone number** (e.g., family
   booking)? Decision needed: show both, or prompt VA to pick.

---

## 6. Acceptance Criteria (Definition of Done)

- [ ] A text sent to the clinic's Quo number appears in the dashboard's Messages inbox
      within one polling cycle (≤10s), without manual refresh.
- [ ] A VA can send a reply from the central Messages inbox and the patient receives it
      via SMS.
- [ ] A VA can open a patient's modal, go to the new "Messages" tab, read that
      patient's SMS history, and send a reply — without leaving the modal.
- [ ] Messages are correctly attributed to the right patient by phone number match.
- [ ] Unmatched phone numbers still show up in the central inbox (not silently lost).
- [ ] No SMS content or patient phone numbers are exposed to unauthenticated users —
      all dashboard messaging routes require login; only the Quo webhook route is public,
      and it's protected by signature/secret verification.
- [ ] Sending fails gracefully with a clear error if Quo credits run out or the API call
      fails (VA sees a failure state, not a silent no-op).