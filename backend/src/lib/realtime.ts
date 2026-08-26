import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import { verifyAccessToken } from "@/lib/auth";
import { logger } from "@/utils/logger";

/**
 * Realtime push over WebSockets, served by the same Express server.
 *
 * Vercel supports this natively now (vercel.com/docs/functions/websockets) -
 * a connection is pinned to one function instance, and Fluid compute lets a
 * single instance hold many connections.
 *
 * IMPORTANT CAVEAT, by design not oversight: Vercel does NOT guarantee that a
 * new connection reaches the same instance as any other request. So a Quo
 * webhook can land on instance A while a VA's browser is connected to
 * instance B, and A's broadcast will never reach B's client. Fixing that
 * properly needs an external pub/sub (e.g. Redis) shared by all instances -
 * deliberately NOT added here, since it's new infrastructure to provision and
 * pay for. Same trade-off Link Internal Board makes below: this is the
 * primary transport (no third-party account/credentials needed - it just
 * runs on this same server), with a REST polling fallback on the frontend
 * catching anything a missed/misrouted push would drop. Pusher (lib/pusher.ts)
 * is kept working and available as a drop-in swap if this ever needs to scale
 * across multiple instances/regions - not wired into Internal Board right now.
 *
 * The frontend keeps a slower polling fallback alongside this socket either
 * way: when the push lands on the right instance you get an instant update,
 * and when it doesn't the poll still catches it a few seconds later. Never a
 * missed message either way - just occasionally a slower one. See
 * useMessagingRealtime() (SMS) / useRealtimeInternalBoard() (Link Internal
 * Board) on the frontend.
 */

/** Everything we push is a small "something changed, refetch it" nudge, never
 *  the record itself - so a client can never render half-stale merged state. */
export type RealtimeEvent =
	| { type: "sms.received"; conversationId: string; messageId: string }
	| { type: "sms.sent"; conversationId: string; messageId: string }
	| { type: "conversation.updated"; conversationId: string }
	| InternalRealtimeEvent;

/**
 * Link Internal Board's own event set - same socket/connection as the SMS
 * events above (one WS per browser tab, not one per feature), namespaced by
 * `type` prefix so a client can tell at a glance which feature an event is
 * for. `new-message`'s payload mirrors what lib/pusher.ts's
 * InternalNewMessagePayload carried, so the frontend's cache-patch logic
 * doesn't care which transport delivered it.
 */
export type InternalRealtimeEvent =
	| {
			type: "internal.new-message";
			conversationId: string;
			messageId: string;
			senderId: string;
			preview: string;
			createdAt: string;
	  }
	| { type: "internal.conversation-updated"; conversationId: string }
	| { type: "internal.typing"; fromUserId: string; fromName: string }
	/** Full online-userId snapshot, not an incremental add/remove - cheap and
	 *  always-correct at staff-roster scale, and avoids a client's presence
	 *  state ever drifting from a missed increment/decrement. */
	| { type: "internal.presence"; onlineUserIds: string[] };

interface Client {
	socket: WebSocket;
	userId: string;
	isAlive: boolean;
}

const clients = new Set<Client>();
let wss: WebSocketServer | null = null;

/** 30s ping/pong sweep so dead connections don't accumulate on the instance. */
const HEARTBEAT_MS = 30_000;

/**
 * Attaches the WebSocket server to an existing HTTP server. Safe to call more
 * than once (no-ops after the first) so local dev and the Vercel entrypoint
 * can both call it without double-attaching.
 */
export function attachRealtime(server: HttpServer): WebSocketServer {
	if (wss) return wss;

	// `noServer` + manual upgrade handling so we can authenticate BEFORE
	// completing the handshake, and so we only claim our own path (any other
	// upgrade request is left alone rather than being hijacked).
	wss = new WebSocketServer({ noServer: true });

	server.on("upgrade", (req, socket, head) => {
		let pathname: string;
		try {
			pathname = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`).pathname;
		} catch {
			socket.destroy();
			return;
		}

		if (pathname !== "/api/realtime") return;

		// Same JWT the REST API uses. Browsers can't set headers on a
		// WebSocket handshake, so the token comes as a query param - it never
		// leaves our own origin, and it's the same short-TTL access token.
		const token = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`).searchParams.get("token");
		if (!token) {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();
			return;
		}

		let userId: string;
		try {
			userId = verifyAccessToken(token).userId;
		} catch {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();
			return;
		}

		wss?.handleUpgrade(req, socket, head, (ws) => {
			const client: Client = { socket: ws, userId, isAlive: true };
			clients.add(client);
			logger.info({ userId, clients: clients.size }, "Realtime client connected");
			broadcastPresence();

			ws.on("pong", () => {
				client.isAlive = true;
			});
			ws.on("close", () => {
				clients.delete(client);
				broadcastPresence();
			});
			ws.on("error", (err) => {
				logger.warn({ err, userId }, "Realtime socket error");
				clients.delete(client);
				broadcastPresence();
			});
		});
	});

	const heartbeat = setInterval(() => {
		let changed = false;
		for (const client of clients) {
			if (!client.isAlive) {
				client.socket.terminate();
				clients.delete(client);
				changed = true;
				continue;
			}
			client.isAlive = false;
			try {
				client.socket.ping();
			} catch {
				clients.delete(client);
				changed = true;
			}
		}
		if (changed) broadcastPresence();
	}, HEARTBEAT_MS);
	// Don't hold the process open just for the heartbeat.
	heartbeat.unref?.();

	logger.info("Realtime WebSocket server attached at /api/realtime");
	return wss;
}

/**
 * Fan out to every client connected to THIS instance. Never throws - realtime
 * is an enhancement on top of polling, so a broadcast failure must never break
 * the request that triggered it (a webhook must still 200, a send must still
 * report success).
 */
export function broadcast(event: RealtimeEvent): void {
	if (clients.size === 0) return;
	const payload = JSON.stringify(event);

	for (const client of clients) {
		if (client.socket.readyState !== WebSocket.OPEN) {
			clients.delete(client);
			continue;
		}
		try {
			client.socket.send(payload);
		} catch (err) {
			logger.warn({ err }, "Failed to push realtime event to a client");
			clients.delete(client);
		}
	}
}

/**
 * Fan out to every socket belonging to one specific user (they may have
 * several tabs/devices open - all of them get it). Used for Link Internal
 * Board's private per-user events (new-message, typing) instead of the
 * broadcast-to-everyone above, which is only right for the SMS module's
 * single shared inbox.
 */
export function broadcastToUser(userId: string, event: InternalRealtimeEvent): void {
	if (clients.size === 0) return;
	const payload = JSON.stringify(event);

	for (const client of clients) {
		if (client.userId !== userId) continue;
		if (client.socket.readyState !== WebSocket.OPEN) {
			clients.delete(client);
			continue;
		}
		try {
			client.socket.send(payload);
		} catch (err) {
			logger.warn({ err, userId }, "Failed to push realtime event to a user");
			clients.delete(client);
		}
	}
}

/** Same as broadcastToUser, for several recipients at once (a DM's two participants). */
export function broadcastToUsers(userIds: string[], event: InternalRealtimeEvent): void {
	for (const userId of userIds) broadcastToUser(userId, event);
}

/** Every distinct userId with at least one open connection right now. */
export function getOnlineUserIds(): string[] {
	return Array.from(new Set(Array.from(clients).map((c) => c.userId)));
}

/** Pushes the current online-userId snapshot to every connected client -
 *  called whenever the connected set changes (connect/disconnect/reap). */
function broadcastPresence(): void {
	broadcast({ type: "internal.presence", onlineUserIds: getOnlineUserIds() });
}

/** Connected-client count on this instance - used by the health endpoint. */
export function realtimeClientCount(): number {
	return clients.size;
}
