import Cookies from "js-cookie"

import { config } from "@/config"
import { env } from "./env"

export function buildInternalBoardSocketUrl(token: string): string {

  const httpBase = env.NEXT_PUBLIC_WEB_SOCKET_URL.replace(/\/api\/?$/, "")
  const wsBase = httpBase.replace(/^http/, "ws")
  return `${wsBase}/api/realtime?token=${encodeURIComponent(token)}`
}

export function getInternalBoardAuthToken(): string | undefined {
  return Cookies.get(config.auth.tokenKey)
}
