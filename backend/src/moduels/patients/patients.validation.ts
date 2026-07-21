import { z } from "zod";

const stageEnum = z.enum([
	"onboarding",
	"visit_complete",
	"post_visit_docs",
	"chart_signed",
	"sent_to_billing",
	"payment_posted",
	"reconciled",
]);

export const StageMoveSchema = z.object({
	body: z.object({
		targetStage: stageEnum,
	}),
});

export const AssignSchema = z.object({
	body: z.object({
		assignedTo: z.string().uuid().nullable(),
	}),
});

export const ChecklistToggleSchema = z.object({
	body: z.object({
		itemId: z.string().uuid(),
		checked: z.boolean(),
	}),
});

export const NotesSchema = z.object({
	body: z.object({
		notes: z.string().max(2000, "Notes must be at most 2000 characters"),
	}),
});

export const FlagSchema = z.object({
	body: z.object({
		reason: z.string().min(1, "Reason is required").max(500, "Reason must be at most 500 characters"),
	}),
});

export const ClearFlagSchema = z.object({
	body: z.object({
		clearReason: z.string().min(1, "Clear reason is required").max(500, "Clear reason must be at most 500 characters"),
	}),
});

export const IntakeSchema = z.object({
	body: z.object({
		name: z.string().trim().min(1, "Patient name is required"),
		email: z.string().email().optional().nullable(),
		phone: z.string().optional().nullable(),
		appointmentDatetime: z.string().datetime().optional().nullable(),
		bookingPlatform: z.enum(["klarity", "zocdoc"]).optional().nullable(),
		problemDescription: z.string().max(2000).optional().nullable(),
	}),
});

export const ClaimSchema = z.object({
	body: z.object({
		userId: z.string().uuid(),
	}),
});

export type StageMoveInput = z.infer<typeof StageMoveSchema>["body"];
export type AssignInput = z.infer<typeof AssignSchema>["body"];
export type ChecklistToggleInput = z.infer<typeof ChecklistToggleSchema>["body"];
export type NotesInput = z.infer<typeof NotesSchema>["body"];
export type FlagInput = z.infer<typeof FlagSchema>["body"];
export type ClearFlagInput = z.infer<typeof ClearFlagSchema>["body"];
export type IntakeInput = z.infer<typeof IntakeSchema>["body"];
export type ClaimInput = z.infer<typeof ClaimSchema>["body"];
