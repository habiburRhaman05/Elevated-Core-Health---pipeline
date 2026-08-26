import { Router } from "express";

import { authorizeChannel, authorizePresenceChannel, getPusherKey, INTERNAL_BOARD_PRESENCE_CHANNEL } from "@/lib/pusher";
import { requireAuth } from "@/middlewares/auth";
import { handleServiceResponse, validateRequest } from "@/utils/httpHandlers";
import { logger } from "@/utils/logger";
import { ServiceResponse } from "@/utils/serviceResponse";
import { internalMessagingController } from "./internal-messaging.controller";
import { internalMessagingUpload } from "./internal-messaging.upload.middleware";
import {
	ConversationIdParamSchema,
	GetInternalMessagesQuerySchema,
	SendInternalMessageSchema,
	SendLazyInternalMessageSchema,
	TypingSchema,
} from "./internal-messaging.validation";

export const internalMessagingRouter: Router = Router();

// Link Internal Board — every route is for logged-in staff (VA/Admin) only.
// No shared auth bar with the SMS messaging module; this is its own gate.
internalMessagingRouter.use(requireAuth);

// Dual transport (see internal-messaging.service.ts's getStatus() doc
// comment): realtime push runs over BOTH the plain WebSocket server in
// lib/realtime.ts (GET /api/realtime, auth'd via JWT query param at the
// socket handshake — no REST route needed for it) AND Pusher, which needs
// this channel-auth route. Pusher is the one that actually works on this
// app's classic-serverless Vercel backend, where a long-lived WebSocket
// can never stay open.
internalMessagingRouter.post("/pusher/auth", (req, res) => {
	if (!getPusherKey()) {
		handleServiceResponse(ServiceResponse.failure("Pusher isn't configured.", null, 400), res);
		return;
	}
	const { socket_id: socketId, channel_name: channelName } = req.body as {
		socket_id?: string;
		channel_name?: string;
	};
	if (!socketId || !channelName) {
		handleServiceResponse(ServiceResponse.failure("Missing socket_id or channel_name.", null, 400), res);
		return;
	}

	if (channelName === INTERNAL_BOARD_PRESENCE_CHANNEL) {
		const result = authorizePresenceChannel(socketId, channelName, req.user!);
		if (!result) {
			handleServiceResponse(ServiceResponse.failure("Pusher authorization failed.", null, 500), res);
			return;
		}
		res.json(result);
		return;
	}

	// A user may only authorize their OWN inbox channel, not anyone else's —
	// otherwise any logged-in staff member could subscribe to another
	// person's private-internal-board-<userId> channel and see their unread
	// counts/new-message events.
	if (channelName.startsWith("private-internal-board-") && channelName !== `private-internal-board-${req.user?.id}`) {
		handleServiceResponse(ServiceResponse.failure("Not authorized for that channel.", null, 403), res);
		return;
	}
	const result = authorizeChannel(socketId, channelName);
	if (!result) {
		logger.warn({ channelName }, "Pusher authorizeChannel returned null — Pusher may not be configured");
		handleServiceResponse(ServiceResponse.failure("Pusher authorization failed.", null, 500), res);
		return;
	}
	res.json(result);
});

internalMessagingRouter.get("/status", internalMessagingController.getStatus);

// Phase 2 — the auto-synced sidebar: every teammate, merged with their
// conversation status. Replaces Phase 1's "list only conversations that
// already exist" + explicit "start a conversation" picker.
internalMessagingRouter.get("/roster", internalMessagingController.getRoster);

internalMessagingRouter.get(
	"/conversations/:id/messages",
	validateRequest(GetInternalMessagesQuerySchema),
	internalMessagingController.getMessages,
);
internalMessagingRouter.post(
	"/conversations/:id/messages",
	validateRequest(SendInternalMessageSchema),
	internalMessagingController.sendMessage,
);
internalMessagingRouter.patch(
	"/conversations/:id/read",
	validateRequest(ConversationIdParamSchema),
	internalMessagingController.markRead,
);

// Lazy send — the sidebar can open a teammate with no conversation at all;
// this is what actually creates one, on the first message only.
internalMessagingRouter.post(
	"/messages",
	validateRequest(SendLazyInternalMessageSchema),
	internalMessagingController.sendLazyMessage,
);

internalMessagingRouter.post("/typing", validateRequest(TypingSchema), internalMessagingController.notifyTyping);

internalMessagingRouter.post(
	"/uploads",
	(req, res, next) => {
		internalMessagingUpload.single("file")(req, res, (err) => {
			if (err) {
				const message = err instanceof Error ? err.message : "Upload failed.";
				res.status(400).json({ success: false, message, data: null, statusCode: 400 });
				return;
			}
			next();
		});
	},
	internalMessagingController.uploadAttachment,
);
