import { Router } from "express";

import { requireAuth } from "@/middlewares/auth";
import { authorizeChannel, getPusherKey } from "@/lib/pusher";
import { handleServiceResponse } from "@/utils/httpHandlers";
import { logger } from "@/utils/logger";
import { ServiceResponse } from "@/utils/serviceResponse";
import { validateRequest } from "@/utils/httpHandlers";
import { messagingController } from "./messaging.controller";
import {
	ConversationIdParamSchema,
	GetMessagesQuerySchema,
	LinkPatientSchema,
	ListConversationsQuerySchema,
	PatientIdParamSchema,
	SendMessageSchema,
} from "./messaging.validation";

export const messagingRouter: Router = Router();

// Every messaging route is for logged-in VAs/admins reading or sending real
// patient SMS content — same auth bar as /patients. Quo itself never talks
// to these; inbound delivery lands on the separate public webhook route.
messagingRouter.use(requireAuth);

// Pusher private-channel auth — the frontend's Pusher client calls this
// to authorize subscriptions to private channels. requireAuth above
// already verified the JWT, so we just need to forward the socketId
// and channelName to Pusher's authorizeChannel.
messagingRouter.post("/pusher/auth", (req, res) => {
	if (!getPusherKey()) {
		handleServiceResponse(ServiceResponse.failure("Pusher is not configured.", null, 400), res);
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
	const result = authorizeChannel(socketId, channelName);
	if (!result) {
		logger.warn({ channelName }, "Pusher authorizeChannel returned null — Pusher may not be configured");
		handleServiceResponse(ServiceResponse.failure("Pusher authorization failed.", null, 500), res);
		return;
	}
	res.json(result);
});

messagingRouter.get("/status", messagingController.getStatus);
messagingRouter.get("/numbers", messagingController.listNumbers);
messagingRouter.get(
	"/conversations",
	validateRequest(ListConversationsQuerySchema),
	messagingController.listConversations,
);
messagingRouter.get(
	"/conversations/by-patient/:patientId",
	validateRequest(PatientIdParamSchema),
	messagingController.getConversationByPatient,
);
messagingRouter.get(
	"/conversations/:id/messages",
	validateRequest(GetMessagesQuerySchema),
	messagingController.getMessages,
);
messagingRouter.post("/conversations/:id/send", validateRequest(SendMessageSchema), messagingController.sendMessage);
messagingRouter.post(
	"/conversations/:id/read",
	validateRequest(ConversationIdParamSchema),
	messagingController.markRead,
);
messagingRouter.patch(
	"/conversations/:id/link-patient",
	validateRequest(LinkPatientSchema),
	messagingController.linkPatient,
);
