export const ROLES = {
  ADMIN: "admin" as const,
  VA: "va" as const,
}

export const ROUTES = {
  LOGIN: "/login",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  DASHBOARD: {
    HOME: "/dashboard",
    BOARD: "/dashboard/board",
    PATIENTS: "/dashboard/patients",
    WORKLOAD: "/dashboard/workload",
    LOG: "/dashboard/log",
    SOP: "/dashboard/sop",
    REPORTING: "/dashboard/reporting",
    IMPORT: "/dashboard/import",
    PROFILE: "/dashboard/profile",
    MESSAGES: "/dashboard/messages",
  },
  ADMIN: {
    HOME: "/admin/dashboard",
    BOARD: "/admin/dashboard/board",
    WORKLOAD: "/admin/dashboard/workload",
    LOG: "/admin/dashboard/log",
    SOP: "/admin/dashboard/sop",
    REPORTING: "/admin/dashboard/reporting",
    IMPORT: "/admin/dashboard/import",
    USERS: "/admin/dashboard/users",
    STAGES: "/admin/dashboard/stages",
    CRM: "/admin/dashboard/crm",
    ELIGIBILITY: "/admin/dashboard/eligibility",
    APP_SETTINGS: "/admin/dashboard/app-settings",
    PROFILE: "/admin/dashboard/profile",
    SETTINGS_WEBHOOKS: "/admin/dashboard/settings/webhooks",
    MESSAGES: "/admin/dashboard/messages",
  },
}

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    REFRESH: "/auth/refresh",
    ME: "/auth/me",
    LOGOUT: "/auth/logout",
    PROFILE: "/auth/profile",
    PROFILE_AVATAR: "/auth/profile/avatar",
    CHANGE_PASSWORD: "/auth/change-password",
    FORGOT_PASSWORD: "/auth/forgot-password",
    RESET_PASSWORD: "/auth/reset-password",
  },
  STAGES: "/stages",
  PATIENTS: "/patients",
  PATIENTS_INTAKE: "/patients/intake",
  PATIENTS_INTAKE_TEST: "/patients/intake-test",
  PATIENTS_IMPORT: "/patients/import",
  PATIENTS_IMPORT_APPLY: "/patients/import/apply",
  PATIENTS_IMPORT_HISTORY: "/patients/import/history",
  CRM: {
    CONTACTS: "/crm/contacts",
    EXPORT: "/crm/contacts/export",
  },
  REPORTING: {
    ADMIN: "/reporting/admin",
    ME: "/reporting/me",
    VA: (id: string) => `/reporting/va/${id}`,
    EXPORT_LOG: "/reporting/export-log",
  },
  PATIENT_CHECK_ELIGIBILITY: (id: string) => `/patients/${id}/check-eligibility`,
  ACTIVITY_LOG: "/activity-log",
  DASHBOARD_SUMMARY: "/dashboard/summary",
  USERS: "/users",
  USERS_VAS: "/users/vas",
  ADMIN: {
    USERS: "/admin/users",
    STAGES: "/admin/stages",
    CHECKLIST_ITEMS: "/admin/checklist-items",
    ELIGIBILITY_RULES: "/admin/eligibility-rules",
    ANALYTICS: "/admin/analytics",
    CRM_INTEGRATION: "/admin/crm-integration",
    CRM_INTEGRATION_CONNECT: "/admin/crm-integration/connect",
    CRM_INTEGRATION_DISCONNECT: "/admin/crm-integration/disconnect",
    CRM_INTEGRATION_PERMISSION: "/admin/crm-integration/permission",
    WEBHOOK_SETTINGS: "/admin/webhooks/settings",
    WEBHOOK_ROTATE_SECRET: "/admin/webhooks/rotate-secret",
    WEBHOOK_TEST: "/admin/webhooks/test",
  },
  MESSAGING: {
    STATUS: "/messaging/status",
    NUMBERS: "/messaging/numbers",
    CONVERSATIONS: "/messaging/conversations",
    CONVERSATION_BY_PATIENT: (patientId: string) => `/messaging/conversations/by-patient/${patientId}`,
    MESSAGES: (conversationId: string) => `/messaging/conversations/${conversationId}/messages`,
    SEND: (conversationId: string) => `/messaging/conversations/${conversationId}/send`,
    READ: (conversationId: string) => `/messaging/conversations/${conversationId}/read`,
    LINK_PATIENT: (conversationId: string) => `/messaging/conversations/${conversationId}/link-patient`,
    CALL_RECORDING: (callLogId: string) => `/messaging/calls/${callLogId}/recording`,
    CALL_SUMMARY: (callLogId: string) => `/messaging/calls/${callLogId}/summary`,
  },
}

export const QUERY_KEYS = {
  AUTH: {
    ME: ["auth", "me"] as const,
  },
  PATIENTS: {
    ALL: ["patients"] as const,
    DETAIL: (id: string) => ["patients", id] as const,
    CHECKLIST_ITEMS: ["checklist-items"] as const,
  },
  ACTIVITY_LOG: {
    // Prefix key — invalidating this refreshes every activity-log query
    // (the modal's patient-scoped list AND the global log page filters).
    ALL: ["activity-log"] as const,
    LIST: (params?: string) => ["activity-log", params] as const,
  },
  USERS: {
    ALL: ["users", "all"] as const,
    VAS: ["users", "vas"] as const,
  },
  CRM: {
    CONTACTS: ["crm", "contacts"] as const,
  },
  REPORTING: {
    ADMIN: ["reporting", "admin"] as const,
    ME: ["reporting", "me"] as const,
    VA: (id: string) => ["reporting", "va", id] as const,
  },
  IMPORT: {
    HISTORY: ["import", "history"] as const,
  },
  DASHBOARD: {
    SUMMARY: ["dashboard", "summary"] as const,
  },
  STAGES: ["stages"] as const,
  MESSAGING: {
    STATUS: ["messaging", "status"] as const,
    NUMBERS: ["messaging", "numbers"] as const,
    // Prefix key — invalidating this refreshes the conversation list AND
    // every open thread/by-patient query below it.
    ALL: ["messaging"] as const,
    CONVERSATIONS: (filters?: Record<string, unknown>) => ["messaging", "conversations", filters] as const,
    CONVERSATION_BY_PATIENT: (patientId: string) => ["messaging", "conversations", "by-patient", patientId] as const,
    MESSAGES: (conversationId: string) => ["messaging", "conversations", conversationId, "messages"] as const,
    CALL_RECORDING: (callLogId: string) => ["messaging", "calls", callLogId, "recording"] as const,
    CALL_SUMMARY: (callLogId: string) => ["messaging", "calls", callLogId, "summary"] as const,
  },
  ADMIN: {
    USERS: ["admin", "users"] as const,
    STAGES: ["admin", "stages"] as const,
    ANALYTICS: ["admin", "analytics"] as const,
    ELIGIBILITY_RULES: ["admin", "eligibility-rules"] as const,
    CRM_INTEGRATION: ["admin", "crm-integration"] as const,
    WEBHOOK_SETTINGS: ["admin", "webhooks", "settings"] as const,
  },
}

export const STALE_HOURS = 48
