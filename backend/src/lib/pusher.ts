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
 * Notify a specific set of participants (their personal inbox channels) that
 * a conversation has a new message or updated metadata. Unlike the SMS
 * module's single shared MESSAGING_CHANNEL (every VA sees every patient
 * thread), internal DMs are private — only the two participants should be
 * pushed, so this fans out per-user rather than broadcasting to everyone.
 */
export function notifyInternalNewMessage(participantIds: string[], conversationId: string, messageId: string): void {
	const p = getPusher();
	if (!p) return;

	const data = { conversationId, messageId };

	try {
		p.trigger(internalConversationChannel(conversationId), "new-message", data);
		for (const userId of participantIds) {
			p.trigger(internalBoardChannel(userId), "new-message", data);
		}
	} catch (err) {
		logger.warn({ err, conversationId }, "Pusher trigger failed for internal-board new-message");
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
