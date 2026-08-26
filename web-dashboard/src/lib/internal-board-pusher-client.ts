import Cookies from "js-cookie"
import Pusher from "pusher-js"

import { config } from "@/config"
import { env } from "./env"

/**
 * Own Pusher client instance for Link Internal Board — deliberately NOT the
 * shared getPusherClient() from pusher-client.ts. That client's authEndpoint
 * is hardcoded to the SMS messaging module's auth route, which authorizes
 * ANY channel name for any logged-in user (no per-channel ownership check —
 * fine for SMS's single shared "everyone sees every patient thread" channel,
 * wrong for internal-board's private per-user inbox channels). Internal Board
 * needs its own endpoint so the server-side "you can only auth your own
 * private-internal-board-<userId> channel" check in
 * internal-messaging.router.ts actually applies.
 */
let pusherInstance: Pusher | null = null

export function getInternalBoardPusherClient(): Pusher | null {
  if (pusherInstance) return pusherInstance
  if (!env.NEXT_PUBLIC_PUSHER_KEY || !env.NEXT_PUBLIC_PUSHER_CLUSTER) return null

  Pusher.logToConsole = env.NEXT_PUBLIC_APP_URL?.includes("localhost") ?? false

  pusherInstance = new Pusher(env.NEXT_PUBLIC_PUSHER_KEY, {
    cluster: env.NEXT_PUBLIC_PUSHER_CLUSTER,
    authEndpoint: `${env.NEXT_PUBLIC_API_URL}/internal-messaging/pusher/auth`,
    auth: {
      headers: {
        Authorization: typeof window !== "undefined" ? `Bearer ${Cookies.get(config.auth.tokenKey) ?? ""}` : "",
      },
    },
  })

  return pusherInstance
}

export const isInternalBoardPusherConfigured = Boolean(env.NEXT_PUBLIC_PUSHER_KEY && env.NEXT_PUBLIC_PUSHER_CLUSTER)

/** Must match backend's INTERNAL_BOARD_PRESENCE_CHANNEL (lib/pusher.ts)
 *  exactly — the one shared channel every staff member subscribes to for
 *  online/offline dots. */
export const INTERNAL_BOARD_PRESENCE_CHANNEL = "presence-internal-board"
