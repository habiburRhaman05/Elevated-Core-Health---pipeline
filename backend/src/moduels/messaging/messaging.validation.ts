import { z } from "zod";

export const ListConversationsQuerySchema = z.object({
	query: z.object({
		page: z.coerce.number().int().positive().default(1),
		limit: z.coerce.number().int().positive().max(100).default(50),
		search: z.string().max(200).optional(),
		unmatchedOnly: z.coerce.boolean().optional(),
		/** Omit for the "All numbers" view. */
		phoneNumberId: z.string().max(64).optional(),
	}),
});

export const PatientIdParamSchema = z.object({
	params: z.object({ patientId: z.string().min(1) }),
});

export const ConversationIdParamSchema = z.object({
	params: z.object({ id: z.string().min(1) }),
});

export const GetMessagesQuerySchema = z.object({
	params: z.object({ id: z.string().min(1) }),
	query: z.object({
		page: z.coerce.number().int().positive().default(1),
		limit: z.coerce.number().int().positive().max(200).default(50),
	}),
});

export const SendMessageSchema = z.object({
	params: z.object({ id: z.string().min(1) }),
	body: z.object({
		content: z.string().min(1, "Message can't be empty").max(1600, "Message is too long (max 1600 characters)"),
		/** Which business number to send from; only consulted when the thread
		 *  doesn't already belong to one. Validated server-side against the
		 *  messaging-capable list. */
		phoneNumberId: z.string().max(64).optional(),
	}),
});

export const LinkPatientSchema = z.object({
	params: z.object({ id: z.string().min(1) }),
	body: z.object({
		patientId: z.string().min(1, "A patient must be selected"),
	}),
});

export const CallLogIdParamSchema = z.object({
	params: z.object({ callLogId: z.string().min(1) }),
});
