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
 * pay for.
 *
 * Instead the frontend keeps a slower polling fallback alongside this socket:
 * when the push lands on the right instance you get an instant update, and
 * when it doesn't the poll still catches it a few seconds later. Never a
 * missed message either way - just occasionally a slower one. See
 * useMessagingRealtime() on the frontend.
 */

/** Everything we push is a small "something changed, refetch it" nudge, never
 *  the record itself - so a client can never render half-stale merged state. */
export type RealtimeEvent =
	| { type: "sms.received"; conversationId: string; messageId: string }
	| { type: "sms.sent"; conversationId: string; messageId: string }
	| { type: "conversation.updated"; conversationId: string };

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

			ws.on("pong", () => {
				client.isAlive = true;
			});
			ws.on("close", () => {
				clients.delete(client);
			});
			ws.on("error", (err) => {
				logger.warn({ err, userId }, "Realtime socket error");
				clients.delete(client);
			});
		});
	});

	const heartbeat = setInterval(() => {
		for (const client of clients) {
			if (!client.isAlive) {
				client.socket.terminate();
				clients.delete(client);
				continue;
			}
			client.isAlive = false;
			try {
				client.socket.ping();
			} catch {
				clients.delete(client);
			}
		}
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

/** Connected-client count on this instance - used by the health endpoint. */
export function realtimeClientCount(): number {
	return clients.size;
}
