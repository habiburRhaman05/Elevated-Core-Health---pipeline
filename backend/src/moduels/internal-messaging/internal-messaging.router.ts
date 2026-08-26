import { Router } from "express";

import { requireAuth } from "@/middlewares/auth";
import { validateRequest } from "@/utils/httpHandlers";
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

// No channel-auth route here — realtime push runs over the plain WebSocket
// server in lib/realtime.ts (GET /api/realtime, outside this REST router
// entirely), authenticated by the same JWT as a query param at the socket
// handshake. See internal-board-socket-client.ts on the frontend.

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
