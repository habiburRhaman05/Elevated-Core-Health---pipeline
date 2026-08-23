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
export type SmsMessageStatus = "sent" | "delivered" | "failed" | "received"

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
  createdAt: string
}

export interface SmsConversation {
  id: string
  phoneNumber: string
  patientId: string | null
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
  total: number
  page: number
  limit: number
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
