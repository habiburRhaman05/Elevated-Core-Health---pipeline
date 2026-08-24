import Cookies from "js-cookie";
import Pusher from "pusher-js";

import { config } from "@/config";
import { env } from "./env";

/**
 * Pusher client instance — null when NEXT_PUBLIC_PUSHER_KEY or
 * NEXT_PUBLIC_PUSHER_CLUSTER is missing. The useRealtimeMessaging hook
 * checks this and no-ops when null, so the app degrades to polling-only.
 */
let pusherInstance: Pusher | null = null;

export function getPusherClient(): Pusher | null {
	if (pusherInstance) return pusherInstance;
	if (!env.NEXT_PUBLIC_PUSHER_KEY || !env.NEXT_PUBLIC_PUSHER_CLUSTER) return null;

	// Disable Pusher's built-in logging in production.
	Pusher.logToConsole = env.NEXT_PUBLIC_APP_URL?.includes("localhost") ?? false;

	pusherInstance = new Pusher(env.NEXT_PUBLIC_PUSHER_KEY, {
		cluster: env.NEXT_PUBLIC_PUSHER_CLUSTER,
		authEndpoint: "/api/v1/messaging/pusher/auth",
		auth: {
			headers: {
				Authorization: typeof window !== "undefined"
					? `Bearer ${Cookies.get(config.auth.tokenKey) ?? ""}`
					: "",
			},
		},
	});

	return pusherInstance;
}

/** Whether Pusher is configured and available. */
export const isPusherConfigured = Boolean(env.NEXT_PUBLIC_PUSHER_KEY && env.NEXT_PUBLIC_PUSHER_CLUSTER);
