export type UserRole = "super_admin" | "admin" | "va"

// Stages are DB-driven now - a stage key is just a stable string slug
// (e.g. "onboarding"). The API returns the full list via GET /stages.
export type PatientStage = string

export interface PipelineStage {
  id: string
  key: string
  name: string
  hint: string | null
  sortOrder: number
  isFinal: boolean
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export type UserStatus = "active" | "inactive"

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status?: UserStatus
  lastLoginAt?: string | null
  shift?: string | null
  avatar?: string | null
  createdAt?: string
  /** Assigned-patient count returned by the admin users list (delete guard). */
  assignedPatientCount?: number
}

export type ChecklistStatus = "required" | "optional"

export type EligibilityStatus = "not_checked" | "eligible" | "not_eligible"

export type PatientFlagType = "positive" | "negative"

export type PatientStatus = "active" | "completed" | "cancelled"

export type VisitStatus = "not_visited" | "arrived" | "no_show" | "rescheduled"

export interface ChecklistItemDef {
  id: string
  label: string
  description?: string | null
  status: ChecklistStatus
  isDefault: boolean
  sortOrder: number
  stage: PatientStage
}

export interface EligibilityRule {
  id: string
  label: string
  field: string
  operator: "is_not_empty" | "is_empty" | "equals" | "contains"
  value?: string | null
  isActive: boolean
  createdAt: string
}

export interface EligibilityDetails {
  vob?: Record<string, unknown>
  evaluatedRules?: number
}

export interface PatientFlag {
  id: string
  patientId: string
  stage: PatientStage
  type: PatientFlagType
  reason: string
  flaggedByUser?: Pick<User, "id" | "name" | "role"> | null
  clearedByUser?: Pick<User, "id" | "name" | "role"> | null
  clearedReason?: string | null
  clearedAt?: string | null
  createdAt: string
}

export interface PatientNote {
  id: string
  patientId: string
  content: string
  createdByUser?: Pick<User, "id" | "name" | "role"> | null
  createdAt: string
  updatedAt: string
}

export interface Patient {
  id: string
  name: string
  firstName?: string | null
  lastName?: string | null
  location?: string | null
  email?: string | null
  phone?: string | null
  dateOfBirth?: string | null
  stage: PatientStage
  status: PatientStatus
  visitStatus: VisitStatus
  assignedTo?: string | null
  assignedUser?: Pick<User, "id" | "name"> | null
  createdById?: string | null
  createdByUser?: Pick<User, "id" | "name"> | null
  notes?: string | null
  checklistState: Record<string, Record<string, boolean>>
  isFlagged: boolean
  flagReason?: string | null
  flaggedByUser?: Pick<User, "id" | "name" | "role"> | null
  flaggedAt?: string | null
  flagClearedReason?: string | null
  flagClearedByUser?: Pick<User, "id" | "name" | "role"> | null
  flagClearedAt?: string | null
  flags?: PatientFlag[]
  patientNotes?: PatientNote[]
  completedAt?: string | null
  cancelledAt?: string | null
  cancelledReason?: string | null
  cancelledByUser?: Pick<User, "id" | "name"> | null
  source: string
  bookingPlatform?: string | null
  appointmentDatetime?: string | null
  paymentMethod?: string | null
  insuranceProvider?: string | null
  paymentDetails?: Record<string, unknown> | null
  copayAmount?: string | null
  amountPaid?: string | null
  eligibilityStatus: EligibilityStatus
  eligibilityCheckedAt?: string | null
  eligibilityDetails?: EligibilityDetails | null
  eligibilityReason?: string | null
  isPrivate: boolean
  privateLockedByUser?: Pick<User, "id" | "name"> | null
  privateLockedAt?: string | null
  updatedAt: string
  createdAt: string
  activityLogs?: ActivityLog[]
}

export type ActivityCategory =
  | "auth"
  | "profile"
  | "patient"
  | "appointment"
  | "user_management"
  | "report"
  | "system"
  | "messaging"

export interface ActivityLog {
  id: string
  patientId: string | null
  author: string
  message: string
  type: "auto" | "manual"
  actorId?: string | null
  actor?: Pick<User, "id" | "name" | "role"> | null
  action?: string | null
  entityType?: string | null
  entityId?: string | null
  prevValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  /** Additive grouping — see ActivityCategory. System-wide events (login, exports, ...) use it; patient rows default to "patient". */
  category?: ActivityCategory | null
  /** Denormalised actor snapshot — survives the actor's user row being deleted. */
  actorRole?: string | null
  actorName?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: string
  patient?: Pick<Patient, "id" | "name">
}

export interface ImportBatch {
  id: string
  fileName: string
  fileType: string
  totalRows: number
  successCount: number
  failCount: number
  duplicateCount: number
  status: "processing" | "completed" | "completed_with_errors" | "failed"
  errorDetails?: Array<{ row: number; message: string; type?: "error" | "duplicate" }> | null
  importedByUser?: Pick<User, "id" | "name"> | null
  createdAt: string
  completedAt?: string | null
}

export type SmsMessageDirection = "inbound" | "outbound"
/** "sending" is a client-only pseudo-status for an optimistic message that
 *  hasn't been confirmed by the server yet — never returned by the API. */
export type SmsMessageStatus = "sent" | "delivered" | "failed" | "received" | "sending"

/** An inbound attachment. Quo has no send-MMS endpoint, so this only ever
 *  appears on inbound messages, never something we attach on an outbound send. */
export interface SmsMediaItem {
  type?: string | null
  url: string
}

export interface SmsMessage {
  id: string
  conversationId: string
  direction: SmsMessageDirection
  body: string
  status: SmsMessageStatus
  quoMessageId?: string | null
  sentById?: string | null
  sentByUser?: Pick<User, "id" | "name"> | null
  errorMessage?: string | null
  media?: SmsMediaItem[] | null
  createdAt: string
}

/**
 * A call (incoming/outgoing) synced from Quo's call history, merged into the
 * thread timeline alongside SmsMessage. `status` is Quo's raw call status
 * string (e.g. "completed" | "missed" | "no-answer" | "busy" | ...) - the UI
 * buckets it into missed/completed/neutral for display.
 */
export interface SmsCallLog {
  id: string
  conversationId: string
  /** Quo's own call-direction values - NOT the same strings as SmsMessageDirection. */
  direction: "incoming" | "outgoing"
  status: string
  durationSeconds?: number | null
  createdAt: string
}

/**
 * A Quo business number on the workspace. `messagingCapable` is
 * informational only (drives whether the compose box is enabled for that
 * inbox) - the actual send gate is enforced server-side, so a restricted
 * number can never send even if this flag were somehow wrong or ignored.
 */
export interface MessagingNumber {
  id: string
  phoneNumberId: string
  formattedNumber: string
  userId: string
  messagingCapable: boolean
}

export interface SmsConversation {
  id: string
  phoneNumber: string
  patientId: string | null
  /** Which business number owns this thread; null on pre-multi-number rows. */
  quoPhoneNumberId?: string | null
  /** Quo's contact display name for this phone number, if known. */
  quoContactName?: string | null
  patient?: { id: string; name: string } | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  createdAt: string
  updatedAt: string
}

export interface SmsConversationsResponse {
  conversations: SmsConversation[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface SmsMessagesResponse {
  messages: SmsMessage[]
  calls: SmsCallLog[]
  total: number
  page: number
  limit: number
}

/** One recording attached to a call, fetched on-demand from Quo when a VA
 *  clicks "Listen recording" on a call-log entry — never stored locally. */
export interface SmsCallRecording {
  id: string
  url: string | null
  type: string | null
  duration: number | null
  startTime: string | null
  status: string | null
}

/** AI call summary, fetched on-demand — `status: "absent"` means the
 *  workspace's Quo plan doesn't generate summaries (or this call wasn't
 *  summarized), not an error; the UI should render a "not available" state. */
export interface SmsCallSummary {
  callId: string
  summary: string[] | null
  nextSteps: string[] | null
  status: "absent" | "in-progress" | "completed" | "failed"
}

export interface CrmContactsResponse {
  contacts: Patient[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResponse {
  user: User
  tokens: AuthTokens
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

export interface DashboardSummary {
  staleCount: number
  flaggedCount: number
  allCaughtUp: boolean
}

export interface PaginatedResponse<T> {
  logs: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface VaUser {
  id: string
  name: string
  /** User role — 'va' or 'admin'. Used to filter assignable users in the UI. */
  role?: string
  /** Optional — the API no longer returns emails on the VA list (Phase 3 exposure trim). */
  email?: string
}

export interface AdminAnalytics {
  patientsPerStage: Record<string, number>
  vaLoad: Array<{ id: string; name: string; patientCount: number }>
  reconciledThisWeek: number
}

export interface WebhookSettings {
  url: string
  secret: string
  source: "database" | "environment"
  rotatedAt: string | null
  rotatedBy: { id: string; name: string } | null
}

export interface WebhookTestResult {
  httpStatus: number
  response: {
    success: boolean
    message: string
    data: Patient | null
    statusCode: number
  }
}

export type CrmProvider = "private_crm" | "gohighlevel"
export type CrmPermission = "read" | "write" | "both"
export type CrmConnectionStatus = "connected" | "disconnected"

export interface CrmIntegration {
  id: string
  provider: CrmProvider
  apiKeyLast4: string | null
  permission: CrmPermission
  status: CrmConnectionStatus
  connectedById: string | null
  connectedByUser?: Pick<User, "id" | "name"> | null
  connectedAt: string | null
  updatedAt: string
  createdAt: string
}

export interface ReportTotals {
  total: number
  active: number
  completed: number
  cancelled: number
}

export interface StageCount {
  stage: string
  label: string
  count: number
}

export interface WorkflowMetrics {
  reconciledThisWeek: number
  staleCount: number
  flaggedCount: number
  avgCompletionDays: number
  completionRate: number
}

export interface VaComparisonRow {
  id: string
  name: string
  assigned: number
  active: number
  completed: number
  cancelled: number
  handledCases: number
  actions: number
  avgCompletionDays: number
  stageCompletionRate: number
}

export interface AdminReport {
  totals: ReportTotals
  byStage: StageCount[]
  workflow: WorkflowMetrics
  vaComparison: VaComparisonRow[]
}

export interface VaActions {
  today: number
  thisWeek: number
  thisMonth: number
}

export interface VaReportPerformance {
  handledCases: number
  actions: VaActions
  avgCompletionDays: number
  stageCompletionRate: number
}

export interface ReportSeries {
  label: string
  count: number
}

export interface VaReport {
  va: Pick<User, "id" | "name" | "email">
  totals: {
    assigned: number
    active: number
    completed: number
    cancelled: number
  }
  workload: number
  stageDistribution: StageCount[]
  performance: VaReportPerformance
  series: {
    daily: ReportSeries[]
    weekly: ReportSeries[]
    monthly: ReportSeries[]
  }
}

export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
  statusCode: number
}

// Static fallback used while stages load from the API - never the source of truth.
export const DEFAULT_STAGES: PipelineStage[] = [
  { id: "stage_onboarding", key: "onboarding", name: "Onboarding", hint: "Scheduled on calendar", sortOrder: 0, isFinal: false, isActive: true },
  { id: "stage_visit_complete", key: "visit_complete", name: "Visit Complete", hint: "Encounter finished", sortOrder: 1, isFinal: false, isActive: true },
  { id: "stage_post_visit_docs", key: "post_visit_docs", name: "Post-Visit Docs", hint: "Letter + labs sent", sortOrder: 2, isFinal: false, isActive: true },
  { id: "stage_chart_signed", key: "chart_signed", name: "Chart Signed", hint: "Optimantra finalized", sortOrder: 3, isFinal: false, isActive: true },
  { id: "stage_sent_to_billing", key: "sent_to_billing", name: "Sent to Billing", hint: "Claim submitted", sortOrder: 4, isFinal: false, isActive: true },
  { id: "stage_payment_posted", key: "payment_posted", name: "Payment Posted", hint: "Payment received", sortOrder: 5, isFinal: false, isActive: true },
  { id: "stage_reconciled", key: "reconciled", name: "Reconciled", hint: "Closed out", sortOrder: 6, isFinal: true, isActive: true },
]

export const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_STAGES.map((s) => [s.key, s.name]),
)

export const STAGE_HINTS: Record<string, string> = Object.fromEntries(
  DEFAULT_STAGES.map((s) => [s.key, s.hint ?? ""]),
)

export const STAGE_ORDER: string[] = DEFAULT_STAGES.map((s) => s.key)

// =============================================================================
// Link Internal Board — internal VA/Admin staff chat. Fully separate from the
// Sms* (patient SMS) types above; a DM here has nothing to do with a patient.
// =============================================================================

export type InternalConversationType = "dm" | "group"
export type InternalAttachmentType = "image" | "video" | "audio" | "file"

export interface InternalAttachment {
  id: string
  type: InternalAttachmentType
  url: string
  thumbnailUrl?: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  width?: number | null
  height?: number | null
  durationSeconds?: number | null
}

/** What POST /internal-messaging/uploads hands back — same shape as
 *  InternalAttachment but with no `id` yet (not persisted until the message
 *  that references it is actually sent). */
export type PendingInternalAttachment = Omit<InternalAttachment, "id">

/** Trimmed quote of the original message a reply points at — just enough to
 *  render "replying to: <snippet/thumbnail> — <sender>" inline. */
export interface InternalMessageReplyRef {
  id: string
  body: string | null
  senderId: string
  senderName: string
  attachmentPreview: Pick<InternalAttachment, "id" | "type" | "url" | "fileName"> | null
  /** True when the original message was soft-deleted after this reply was sent. */
  deleted: boolean
}

export interface InternalMessage {
  id: string
  conversationId: string
  senderId: string
  sender: Pick<User, "id" | "name" | "role" | "avatar">
  body: string | null
  attachments: InternalAttachment[]
  replyTo: InternalMessageReplyRef | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  /** Client-only — set on the optimistic bubble while a send is in flight. */
  status?: "sending" | "failed"
}

export interface InternalMessagesResponse {
  messages: InternalMessage[]
  total: number
  page: number
  limit: number
}

/** A DM's status as seen from the roster — undefined identity fields since
 *  the roster item already carries the other person via `.user`. Null when
 *  no conversation exists yet (Phase 2: the sidebar shows the teammate
 *  regardless). */
export interface InternalConversationSummary {
  id: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
}

/**
 * Phase 2 — one row of the auto-synced sidebar: a teammate, merged with
 * their DM's status if one exists. `conversation: null` means "never
 * messaged" — still shown, still clickable, just with an empty thread until
 * the first message is actually sent (see useSendInternalMessage's lazy path).
 */
export interface InternalRosterItem {
  user: Pick<User, "id" | "name" | "role" | "avatar">
  conversation: InternalConversationSummary | null
}

export interface InternalRosterResponse {
  items: InternalRosterItem[]
}

/** Either target a message/typing-ping can resolve to — an existing
 *  conversation, or (before the first message) a specific teammate. */
export type InternalMessageTarget = { conversationId: string } | { recipientUserId: string }
