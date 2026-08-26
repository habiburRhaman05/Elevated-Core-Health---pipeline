import { Router } from "express";

import { authorizeChannel, getPusherKey } from "@/lib/pusher";
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
	StartConversationSchema,
} from "./internal-messaging.validation";

export const internalMessagingRouter: Router = Router();

// Link Internal Board — every route is for logged-in staff (VA/Admin) only.
// No shared auth bar with the SMS messaging module; this is its own gate.
internalMessagingRouter.use(requireAuth);

// Pusher private-channel auth — identical shape to messaging.router.ts's
// /pusher/auth, just under this module's own path so it authorizes against
// the internal-board channel namespace (private-internal-board-*,
// private-internal-conversation-*) instead of the SMS one.
internalMessagingRouter.post("/pusher/auth", (req, res) => {
	if (!getPusherKey()) {
		handleServiceResponse(ServiceResponse.failure("Real-time isn't configured.", null, 400), res);
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
	// A user may only authorize their OWN inbox channel, not anyone else's —
	// otherwise any logged-in staff member could subscribe to another
	// person's private-internal-board-<userId> channel and see their unread
	// counts/new-message events. Per-conversation channels are still checked
	// implicitly: the frontend only ever subscribes to threads it already
	// fetched (which requireParticipant gated), so no extra check needed there.
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

internalMessagingRouter.get("/conversations", internalMessagingController.listConversations);
internalMessagingRouter.post(
	"/conversations",
	validateRequest(StartConversationSchema),
	internalMessagingController.startConversation,
);

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
