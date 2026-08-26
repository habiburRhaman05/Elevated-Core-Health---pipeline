import Cookies from "js-cookie"

import { config } from "@/config"
import { env } from "./env"

/**
 * Link Internal Board's realtime transport — a plain WebSocket straight to
 * the backend's `attachRealtime()` server (backend/src/lib/realtime.ts), NOT
 * Pusher. No third-party account/credentials needed; it just runs on the
 * same Express server this app already talks to over REST. Pusher
 * (lib/internal-board-pusher-client.ts) is kept working and available as a
 * drop-in swap if this ever needs to fan out across multiple backend
 * instances/regions — deliberately not wired in right now.
 *
 * Browsers can't set custom headers on a WebSocket handshake, so the same
 * short-TTL access token the REST API uses goes as a `?token=` query param
 * instead — it never leaves this app's own origin.
 */
export function buildInternalBoardSocketUrl(token: string): string {
  // NEXT_PUBLIC_API_URL is the REST base (e.g. "http://localhost:8080/api");
  // the realtime server is mounted on the same host at "/api/realtime",
  // outside the "/api" REST router entirely (see attachRealtime's raw
  // upgrade-path check) — so strip the trailing "/api" before appending it.
  const httpBase = env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, "")
  const wsBase = httpBase.replace(/^http/, "ws")
  return `${wsBase}/api/realtime?token=${encodeURIComponent(token)}`
}

export function getInternalBoardAuthToken(): string | undefined {
  return Cookies.get(config.auth.tokenKey)
}
