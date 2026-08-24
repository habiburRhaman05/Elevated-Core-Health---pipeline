import { Router } from "express";

import { requireAuth } from "@/middlewares/auth";
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
