export type UserRole = "admin" | "va"

export type PatientStage =
  | "onboarding"
  | "visit_complete"
  | "post_visit_docs"
  | "chart_signed"
  | "sent_to_billing"
  | "payment_posted"
  | "reconciled"

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  shift?: string | null
  createdAt?: string
}

export interface ChecklistItemDef {
  id: string
  label: string
  description?: string | null
  isDefault: boolean
  sortOrder: number
  stage: PatientStage
}

export interface Patient {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  stage: PatientStage
  assignedTo?: string | null
  assignedUser?: Pick<User, "id" | "name"> | null
  notes?: string | null
  checklistState: Record<string, Record<string, boolean>>
  isFlagged: boolean
  flagReason?: string | null
  flaggedByUser?: Pick<User, "id" | "name"> | null
  flaggedAt?: string | null
  flagClearedReason?: string | null
  flagClearedByUser?: Pick<User, "id" | "name"> | null
  flagClearedAt?: string | null
  source: string
  bookingPlatform?: string | null
  appointmentDatetime?: string | null
  updatedAt: string
  createdAt: string
  activityLogs?: ActivityLog[]
}

export interface ActivityLog {
  id: string
  patientId: string
  author: string
  message: string
  type: "auto" | "manual"
  createdAt: string
  patient?: Pick<Patient, "id" | "name">
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
  email: string
}

export interface AdminAnalytics {
  patientsPerStage: Record<string, number>
  vaLoad: Array<{ id: string; name: string; patientCount: number }>
  reconciledThisWeek: number
}

export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
  statusCode: number
}

export const STAGE_LABELS: Record<PatientStage, string> = {
  onboarding: "Onboarding",
  visit_complete: "Visit Complete",
  post_visit_docs: "Post-Visit Docs",
  chart_signed: "Chart Signed",
  sent_to_billing: "Sent to Billing",
  payment_posted: "Payment Posted",
  reconciled: "Reconciled",
}

export const STAGE_HINTS: Record<PatientStage, string> = {
  onboarding: "Scheduled on calendar",
  visit_complete: "Encounter finished",
  post_visit_docs: "Letter + labs sent",
  chart_signed: "Optimantra finalized",
  sent_to_billing: "Claim submitted",
  payment_posted: "Payment received",
  reconciled: "Closed out",
}

export const STAGE_ORDER: PatientStage[] = [
  "onboarding",
  "visit_complete",
  "post_visit_docs",
  "chart_signed",
  "sent_to_billing",
  "payment_posted",
  "reconciled",
]
