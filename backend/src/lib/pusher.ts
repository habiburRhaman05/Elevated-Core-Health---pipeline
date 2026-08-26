import Pusher from "pusher";

import { env } from "@/utils/envConfig";
import { logger } from "@/utils/logger";

/**
 * Pusher instance — null when PUSHER_* env vars are missing. Every public
 * function below checks this and no-ops silently when it's null, so the
 * entire app degrades to polling-only without crashing.
 */
let pusher: Pusher | null = null;

function getPusher(): Pusher | null {
	if (pusher) return pusher;
	if (!env.PUSHER_APP_ID || !env.PUSHER_KEY || !env.PUSHER_SECRET || !env.PUSHER_CLUSTER) {
		return null;
	}
	pusher = new Pusher({
		appId: env.PUSHER_APP_ID,
		key: env.PUSHER_KEY,
		secret: env.PUSHER_SECRET,
		cluster: env.PUSHER_CLUSTER,
		useTLS: true,
	});
	logger.info({ cluster: env.PUSHER_CLUSTER }, "Pusher real-time notifications enabled");
	return pusher;
}

/**
 * The Pusher key (public, safe to expose to the frontend). Returns null when
 * Pusher isn't configured so the client can fall back to polling-only.
 */
export function getPusherKey(): string | null {
	return env.PUSHER_KEY ?? null;
}

/**
 * Authorize a private-channel subscription. Called from POST /pusher/auth
 * after requireAuth has already verified the user's JWT.
 *
 * NOTE: Pusher's `authorizeChannel` expects a socketId and channelName —
 * we pass these through from the route handler. The channel MUST start
 * with "private-" for this to work (Pusher rejects non-private channel
 * auth requests).
 */
export function authorizeChannel(socketId: string, channelName: string): { auth: string } | null {
	const p = getPusher();
	if (!p) return null;
	const authResponse = p.authorizeChannel(socketId, channelName);
	// authorizeChannel returns a ChannelAuthResponse — extract the auth string
	// for the frontend's Pusher client.
	return typeof authResponse === "string" ? { auth: authResponse } : (authResponse as { auth: string });
}

/**
 * Same as authorizeChannel, but for a "presence-" channel — these require
 * `channel_data` (who this socket represents) baked into the auth response
 * so every other subscriber's `members` list can render it. Used only for
 * the Link Internal Board presence channel (online/offline dots).
 */
export function authorizePresenceChannel(
	socketId: string,
	channelName: string,
	user: { id: string; name: string },
): { auth: string; channel_data: string } | null {
	const p = getPusher();
	if (!p) return null;
	const authResponse = p.authorizeChannel(socketId, channelName, {
		user_id: user.id,
		user_info: { name: user.name },
	});
	return authResponse as { auth: string; channel_data: string };
}

/** Channel name for conversation-list-level updates (unread count, last message preview). */
export const MESSAGING_CHANNEL = "private-messaging";

/** Channel name for per-thread updates (new message in a specific conversation). */
export function conversationChannel(conversationId: string): string {
	return `private-conversation-${conversationId}`;
}

/**
 * Notify all connected clients that a new message was received or sent in
 * a conversation. Payload is intentionally minimal — just IDs, never the
 * message body — so PHI content never transits through a third party's
 * push infrastructure at rest.
 */
export function notifyNewMessage(conversationId: string, messageId: string): void {
	const p = getPusher();
	if (!p) return;

	const data = { conversationId, messageId };

	try {
		// Per-thread subscribers (anyone with this thread open).
		p.trigger(conversationChannel(conversationId), "new-message", data);
		// Conversation-list subscribers (inbox badge / last-message preview).
		p.trigger(MESSAGING_CHANNEL, "new-message", data);
	} catch (err) {
		logger.warn({ err, conversationId }, "Pusher trigger failed for new-message");
	}
}

/**
 * Notify all connected clients that a conversation's metadata changed
 * (lastMessagePreview, unreadCount, quoContactName, patient link, etc.).
 * Same minimal payload — just the conversation ID for refetch.
 */
export function notifyConversationUpdated(conversationId: string): void {
	const p = getPusher();
	if (!p) return;

	const data = { conversationId };

	try {
		p.trigger(MESSAGING_CHANNEL, "conversation-updated", data);
	} catch (err) {
		logger.warn({ err, conversationId }, "Pusher trigger failed for conversation-updated");
	}
}

// =============================================================================
// Link Internal Board (VA/Admin staff chat) — reuses only the Pusher client
// singleton above. Own channel namespace, own event payloads; never mixed
// with the patient-SMS channels/events above.
// =============================================================================

/** Per-user inbox channel — conversation list updates (new thread, unread count, preview). */
export function internalBoardChannel(userId: string): string {
	return `private-internal-board-${userId}`;
}

/** Per-thread channel — new messages in one specific conversation. */
export function internalConversationChannel(conversationId: string): string {
	return `private-internal-conversation-${conversationId}`;
}

/**
 * One shared presence channel every staff member subscribes to — gives the
 * whole roster online/offline for free via Pusher's built-in member
 * add/remove events, no per-DM presence bookkeeping needed. Deliberately
 * unauthenticated-content: presence channels only ever carry {id, name}
 * (see authorizePresenceChannel), never anything else.
 */
export const INTERNAL_BOARD_PRESENCE_CHANNEL = "presence-internal-board";

/** What a sidebar-patch push carries — enough for the client to update one
 *  row (preview, timestamp, unread) and re-sort, without a refetch. Never
 *  the full message body-as-such beyond the trimmed preview already meant
 *  for display. */
export interface InternalNewMessagePayload {
	conversationId: string;
	messageId: string;
	senderId: string;
	preview: string;
	createdAt: string;
}

/**
 * Notify a specific set of participants (their personal inbox channels) that
 * a conversation has a new message. Unlike the SMS module's single shared
 * MESSAGING_CHANNEL (every VA sees every patient thread), internal DMs are
 * private — only the two participants should be pushed, so this fans out
 * per-user rather than broadcasting to everyone. The payload carries enough
 * (sender, preview, timestamp) for the sidebar to patch just that one row
 * in place instead of refetching the whole list.
 */
export function notifyInternalNewMessage(participantIds: string[], payload: InternalNewMessagePayload): void {
	const p = getPusher();
	if (!p) return;

	try {
		p.trigger(internalConversationChannel(payload.conversationId), "new-message", payload);
		for (const userId of participantIds) {
			p.trigger(internalBoardChannel(userId), "new-message", payload);
		}
	} catch (err) {
		logger.warn(
			{ err, conversationId: payload.conversationId },
			"Pusher trigger failed for internal-board new-message",
		);
	}
}

/** Same idea as notifyConversationUpdated, scoped to the DM's participants. */
export function notifyInternalConversationUpdated(participantIds: string[], conversationId: string): void {
	const p = getPusher();
	if (!p) return;

	const data = { conversationId };

	try {
		for (const userId of participantIds) {
			p.trigger(internalBoardChannel(userId), "conversation-updated", data);
		}
	} catch (err) {
		logger.warn({ err, conversationId }, "Pusher trigger failed for internal-board conversation-updated");
	}
}

/**
 * Typing indicator — server-triggered (not a Pusher client event) so it
 * stays consistent with the rest of this app's server-authoritative
 * approach and needs no extra Pusher dashboard configuration. Pushed to the
 * recipient's personal board channel rather than a per-conversation one,
 * since a brand-new chat (no conversation row yet) still needs to show
 * "typing…" before the first message has been sent.
 */
export function notifyInternalTyping(recipientId: string, from: { id: string; name: string }): void {
	const p = getPusher();
	if (!p) return;

	try {
		p.trigger(internalBoardChannel(recipientId), "typing", from);
	} catch (err) {
		logger.warn({ err, recipientId }, "Pusher trigger failed for internal-board typing");
	}
}
