# Claude Code Prompt — Quo (OpenPhone) SMS Integration

Copy everything below into Claude Code as your task instructions.

---

## Context

You're working in the **Elevated Core Health — Patient Pipeline Portal** monorepo
(`backend/` = Express + Prisma + PostgreSQL, deployed on Vercel serverless;
`web-dashboard/` = Next.js 16 + TanStack Query + Tailwind). Read `CLAUDE.md` at the repo
root first — it defines the existing business rules, roles (`admin`, `va`), and the
fact that patient data is treated as PHI.

We are adding **two-way SMS messaging** via the **Quo API** (formerly OpenPhone,
`https://api.quo.com`). Follow the existing module structure exactly — do not invent a
new pattern. Look at `backend/src/moduels/webhooks/` and `backend/src/moduels/patients/`
as your reference for how controller/router/service/validation files are organized, how
`ServiceResponse` and `handleServiceResponse` are used, and how `audit()` from
`@/lib/audit` is called after mutations.

**Realtime strategy: polling only.** Do not add Socket.io, Pusher, Ably, or any
WebSocket/SSE mechanism. The backend runs on Vercel serverless and cannot hold
persistent connections. All "live" updates on the frontend must come from TanStack
Query's `refetchInterval` (5–10 second range), matching how the rest of this dashboard
already re-fetches data.

---

## Phase 1 — Database schema

Add to `backend/prisma/schema.prisma`, following the existing style (camelCase fields
mapped to snake_case columns via `@map`, `@@map` for table names):

```prisma
model SmsConversation {
  id             String   @id @default(uuid())
  phoneNumber    String   @unique @map("phone_number") // E.164 normalized
  patientId      String?  @map("patient_id")
  quoContactId   String?  @map("quo_contact_id")
  lastMessageAt  DateTime? @map("last_message_at")
  lastMessagePreview String? @map("last_message_preview")
  unreadCount    Int      @default(0) @map("unread_count")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at")

  patient  Patient?     @relation(fields: [patientId], references: [id])
  messages SmsMessage[]

  @@index([patientId])
  @@index([lastMessageAt])
  @@map("sms_conversations")
}

model SmsMessage {
  id             String   @id @default(uuid())
  conversationId String   @map("conversation_id")
  direction      String   // "inbound" | "outbound"
  body           String
  status         String   @default("sent") // sent | delivered | failed | received
  quoMessageId   String?  @unique @map("quo_message_id")
  sentById       String?  @map("sent_by_id") // VA/admin user id, outbound only
  errorMessage   String?  @map("error_message")
  createdAt      DateTime @default(now()) @map("created_at")

  conversation SmsConversation @relation(fields: [conversationId], references: [id])
  sentByUser   User?           @relation(fields: [sentById], references: [id])

  @@index([conversationId])
  @@index([createdAt])
  @@map("sms_messages")
}
```

Also add the reverse relations to the existing `Patient` and `User` models
(`smsConversations SmsConversation[]` on Patient, `sentSmsMessages SmsMessage[]` on
User) so Prisma's relation checker is happy.

Run `npx prisma migrate dev --name add_sms_messaging` and confirm the migration file
looks correct before moving on.

---

## Phase 2 — Quo API client

Create `backend/src/lib/quo.ts`. This is a small wrapper around the Quo REST API
(`https://api.quo.com/v1`), not a full SDK. Needs:

- `sendMessage({ to, from, userId, content })` → `POST /v1/messages`
- `listPhoneNumbers()` → `GET /v1/phone-numbers` (used once to find our business
  number's `userId`/`from` value — can be a one-off script, doesn't need a route)
- `verifyWebhookSignature(rawBody, signatureHeader)` — **before implementing this,
  check Quo's actual webhook docs for the signing mechanism.** If Quo doesn't sign
  webhooks, fall back to a shared-secret query param or header, following the same
  pattern as the existing `WEBHOOK_SECRET` used in
  `backend/src/moduels/webhooks/webhooks.service.ts` (`getActiveSecret()`).

Read the API key from `process.env.QUO_API_KEY` — do not store it in the database.
Add `QUO_API_KEY` and `QUO_WEBHOOK_SIGNING_SECRET` to `backend/.env.template` with
comments, matching the style already used for `RESEND_API_KEY` and `CLOUDINARY_*`.

Use `fetch` (Node 18+ has it built in) — no need to add `axios` to the backend.

---

## Phase 3 — Messaging module (`backend/src/moduels/messaging/`)

Create these files, mirroring `moduels/patients/` structure:

**`messaging.validation.ts`** — Zod schemas:
- `SendMessageSchema` — `{ body: { content: string().min(1).max(1600) } }`
- `ListConversationsQuerySchema` — pagination (`page`, `limit`), optional `search`,
  optional `unmatchedOnly` boolean filter

**`messaging.service.ts`**:
- `listConversations(query)` — paginated, ordered by `lastMessageAt` desc, includes
  linked patient's name (if any). Support `unmatchedOnly` filter for the "no patient
  linked" bucket.
- `getConversationByPatientId(patientId)` — used by the patient modal tab. If no
  conversation row exists yet for that patient's phone number, return an empty/created
  shell rather than a 404 — a VA should be able to send the *first* message to a
  patient even before any inbound message has ever arrived.
- `getMessages(conversationId, pagination)` — thread fetch, chronological order
- `sendMessage(conversationId, content, actor, ctx)` — calls `quo.sendMessage(...)`,
  writes an outbound `SmsMessage` row with `sentById: actor.id`, updates
  `SmsConversation.lastMessageAt` / `lastMessagePreview`, and **always calls `audit()`**
  (see Activity Tracking section below — this is a hard requirement, not optional).
  On Quo API failure, save the message with `status: "failed"` and `errorMessage` set,
  and return a clear failure `ServiceResponse` — never fail silently.
- `markConversationRead(conversationId, actor)` — resets `unreadCount` to 0 when a VA
  opens a thread.

**`messaging.controller.ts`** — thin, same pattern as `webhooks.controller.ts`
(`handleServiceResponse`, checks `req.user` where auth matters).

**`messaging.router.ts`**:
```
GET    /conversations
GET    /conversations/by-patient/:patientId
GET    /conversations/:id/messages
POST   /conversations/:id/send
POST   /conversations/:id/read
```
All routes go through `requireAuth` (mirror `patientsRouter.use(requireAuth)`).

Register in `backend/src/moduels/routes.ts`:
```ts
apiRouter.use("/messaging", messagingRouter);
```

---

## Phase 3.5 — Activity tracking (required, not optional)

Every SMS event must be traceable to **who did what, to which patient, and when** —
same standard the rest of this app already holds for stage moves, flags, and notes.

1. **Add `"messaging"` to the `ActivityCategory` enum** in `schema.prisma`:
   ```prisma
   enum ActivityCategory {
     auth
     profile
     patient
     appointment
     user_management
     report
     system
     messaging
   }
   ```
   Run a migration for this enum change.

2. **On outbound send** (`messaging.service.ts` → `sendMessage`), call `audit()` exactly
   like other mutating actions in `patients.service.ts` do:
   ```ts
   await audit({
     user: actor,
     patientId: conversation.patientId ?? null,
     action: "sms.sent",
     category: "messaging",
     entityType: "sms_message",
     entityId: message.id,
     message: `${actor.name} sent an SMS to ${patientLabel}`,
     metadata: { conversationId, phoneNumber: conversation.phoneNumber, status: message.status },
     ip: ctx.ip,
     userAgent: ctx.userAgent,
   });
   ```
   This is what makes "who sent this message" answerable from the existing Activity
   Log UI — don't build a separate log for it, feed the same `activity_log` table.

3. **On inbound webhook receipt** (Phase 4), also call `audit()` with `user: null`
   (system action, same convention the existing `/api/patients/intake` webhook already
   uses) so inbound messages show up in the patient's Activity tab too:
   ```ts
   await audit({
     user: null,
     patientId: conversation.patientId ?? null,
     action: "sms.received",
     category: "messaging",
     entityType: "sms_message",
     entityId: message.id,
     message: conversation.patientId
       ? `Inbound SMS received from ${patientLabel}`
       : `Inbound SMS received from unmatched number ${conversation.phoneNumber}`,
     type: "auto",
     metadata: { conversationId, phoneNumber: conversation.phoneNumber },
   });
   ```

4. **Surface attribution in the UI, not just the DB.** In both the central inbox thread
   view and the patient modal's Messages tab, every outbound bubble must show **who
   sent it** (VA/admin name) under or beside the message, not just "you" — since
   multiple VAs share this inbox across shifts, seeing only "sent" with no name defeats
   the point. Pull this from `SmsMessage.sentByUser.name` (add `sentByUser` to the
   Prisma `include` in `getMessages`).

5. **Patient modal's existing Activity tab should also show SMS events for free** once
   `audit()` is wired correctly. Add two entries to `ACTION_META` in
   `web-dashboard/src/lib/activity-meta.ts` (this is the exact `action` → icon/label/
   color map already used for `"stage.move"`, `"flag.create"`, etc.):
   ```ts
   "sms.sent": { label: "SMS Sent", icon: MessageSquare, color: "#0F9B8E" },
   "sms.received": { label: "SMS Received", icon: MessageSquare, color: "#036638" },
   ```

---

## Phase 4 — Inbound webhook receiver

Add a new route to `backend/src/moduels/webhooks/` (or a small new
`webhooks-quo.router.ts` in the same folder — your call, keep it close to the existing
intake webhook for consistency) mounted on the **public** router pattern, same as
`patientsPublicRouter.post("/intake", ...)`:

```
POST /api/webhooks/quo
```

Handler logic:
1. Verify the request using `verifyWebhookSignature` from `lib/quo.ts`. Reject with 401
   if invalid — **do not process the payload before verifying it.**
2. Parse the Quo payload (check Quo's actual webhook payload shape from their docs —
   likely wraps the message under something like `data.object` per their event-driven
   webhook style; confirm against real Quo docs before hardcoding field paths).
3. Normalize the sender phone number to E.164.
4. `SmsConversation` upsert by `phoneNumber`:
   - if a `Patient` with matching `phone` exists, link `patientId`
   - if multiple patients share that phone, link to the most recently updated one and
     log a note in `activity_log` flagging the ambiguity for a human to check — do not
     silently guess and hide the ambiguity
   - if no patient matches, leave `patientId` null (this is the "unmatched" bucket)
5. Insert `SmsMessage` with `direction: "inbound"`, increment `unreadCount`.
6. Return `200` quickly — do not do slow work in the webhook handler itself.

This endpoint must **not** require `requireAuth` (Quo can't log in as a user) but
**must** verify the signature/secret. Treat this exactly as security-sensitive as the
existing `/api/patients/intake` endpoint.

---

## Phase 5 — Dashboard: central Messages inbox

In `web-dashboard/src/`:

1. **API hooks** — new file `hooks/query/useMessaging.ts`, following the exact
   conventions in `hooks/query/usePatients.ts` (React Query `useQuery`/`useMutation`,
   query key arrays, `axios` instance already configured in the project).
   - `useConversations(filters)` — `refetchInterval: 8000`
   - `useConversationMessages(conversationId)` — `refetchInterval: 5000`, only
     `enabled` when a conversation is actively open
   - `useSendMessage()` — mutation, invalidates the relevant query keys on success
   - `useConversationByPatient(patientId)` — for the modal tab

2. **New route** `web-dashboard/src/app/messages/page.tsx` (check the existing app
   router structure under `src/app/` first and match its layout conventions — sidebar,
   auth guard wrapper, etc., same as other top-level pages).
   - Left panel: conversation list, each row shows patient name (or phone number if
     unmatched), last message preview, relative timestamp, unread badge.
   - Right panel: selected thread, message bubbles (inbound left, outbound right,
     matching a typical chat UI), input box + send button at the bottom.
   - Add an "Unmatched" filter toggle/tab at the top of the conversation list.

3. **Sidebar nav** — add a "Messages" entry with an unread-count badge (sum of
   `unreadCount` across conversations) to whatever sidebar/nav component already lists
   Dashboard/Patients/Admin etc. Find it under `src/components/` — likely something like
   `app-sidebar.tsx` or similar; match its existing icon + label pattern (`lucide-react`
   icons are already used throughout, e.g. `MessageSquare` is already imported in
   `patient-modal.tsx`).

---

## Phase 6 — Patient modal: new "Messages" tab

Edit `web-dashboard/src/components/features/patient-modal.tsx`.

- This file already has a tab system (`activeTab === "flags"`, `activeTab ===
  "activity"`, etc. — search for `activeTab` to find the tab button list and the
  conditional render blocks). Add a new tab button labeled "Messages" with a
  `MessageSquare` icon (already imported) next to the existing tabs.
- On `activeTab === "messages"`, render a compact thread view using
  `useConversationByPatient(patient.id)` + `useConversationMessages(...)`, scoped to
  this one patient's phone number. Reuse the same message-bubble UI you build in Phase
  5 as a shared component (`components/features/messaging/message-thread.tsx` or
  similar) so you're not duplicating chat UI code between the modal and the central
  inbox.
- Include a send box at the bottom of this tab, wired to the same `useSendMessage()`
  hook.
- Only poll (`refetchInterval`) while this tab is the active one — do not poll tabs
  that aren't currently visible.

---

## Phase 7 — Env vars & docs

- Add `QUO_API_KEY` and `QUO_WEBHOOK_SIGNING_SECRET` to `backend/.env.template` with
  short comments (mirror existing style for `RESEND_API_KEY`).
- Add a short section to `backend/README.md` explaining how to configure the Quo
  webhook URL (`https://<domain>/api/webhooks/quo`) in the Quo dashboard, following the
  same tone as any existing webhook setup notes in that file.

---

## Explicit constraints — do not violate these

1. **No WebSockets/Pusher/Ably/SSE.** Polling only, per client decision.
2. **No API keys in the database.** Env vars only (`QUO_API_KEY`).
3. **Never silently drop a message.** If phone number doesn't match a patient, still
   store and show it (unmatched bucket) — never discard.
4. **Never silently fail a send.** Save failed sends with `status: "failed"` and a
   visible error, don't just swallow the API error.
5. **Verify webhook authenticity before processing.** No exceptions, same seriousness
   as the existing patient intake webhook.
6. **Follow existing module conventions exactly** (`ServiceResponse`,
   `handleServiceResponse`, `validateRequest`, `audit()`, `requireAuth`,
   `requireRole`) — don't introduce a parallel pattern for this one feature.
7. **Don't add MMS support** — Quo's API doesn't support it; if an inbound webhook
   payload contains a media attachment, store the text portion and log/ignore the
   media gracefully rather than crashing.

---

## Suggested build order (do these as separate commits/PRs, not one giant change)

1. Prisma schema + migration (Phase 1)
2. Quo API client (Phase 2)
3. Messaging backend module, no webhook yet — test send via Postman/curl using a
   manually created conversation row (Phase 3)
4. Inbound webhook receiver (Phase 4) — test with Quo's webhook test-send feature if
   available, or a manual curl matching their payload shape
5. Central Messages inbox UI (Phase 5)
6. Patient modal tab (Phase 6), reusing Phase 5's thread component
7. Env var docs + README update (Phase 7)

After each phase, run existing lint/test commands (`npm run lint`, relevant `vitest`
suites already in the repo) before moving to the next phase.