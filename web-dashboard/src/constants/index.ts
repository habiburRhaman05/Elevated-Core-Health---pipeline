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
    LOG: "/dashboard/log",
    SOP: "/dashboard/sop",
    PROFILE: "/dashboard/profile",
  },
  ADMIN: {
    HOME: "/admin/dashboard",
    BOARD: "/admin/dashboard/board",
    LOG: "/admin/dashboard/log",
    USERS: "/admin/dashboard/users",
    CHECKLIST: "/admin/dashboard/checklist",
    PROFILE: "/admin/dashboard/profile",
  },
}

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/auth/login",
    REFRESH: "/auth/refresh",
    ME: "/auth/me",
    LOGOUT: "/auth/logout",
    PROFILE: "/auth/profile",
    CHANGE_PASSWORD: "/auth/change-password",
    FORGOT_PASSWORD: "/auth/forgot-password",
    RESET_PASSWORD: "/auth/reset-password",
  },
  PATIENTS: "/patients",
  PATIENTS_INTAKE: "/patients/intake",
  PATIENTS_INTAKE_TEST: "/patients/intake-test",
  ACTIVITY_LOG: "/activity-log",
  DASHBOARD_SUMMARY: "/dashboard/summary",
  ADMIN: {
    USERS: "/admin/users",
    CHECKLIST_ITEMS: "/admin/checklist-items",
    ANALYTICS: "/admin/analytics",
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
    LIST: (params?: string) => ["activity-log", params] as const,
  },
  DASHBOARD: {
    SUMMARY: ["dashboard", "summary"] as const,
  },
  ADMIN: {
    USERS: ["admin", "users"] as const,
    ANALYTICS: ["admin", "analytics"] as const,
  },
}

export const STALE_HOURS = 48
