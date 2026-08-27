import { z } from "zod";

export const StageMoveSchema = z.object({
	body: z.object({
		// Stage keys are now DB-driven; existence is validated in the service.
		targetStage: z.string().trim().min(1, "Target stage is required").max(100),
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
		content: z.string().trim().min(1, "Note content is required").max(2000, "Note must be at most 2000 characters"),
	}),
});

export const DeleteNoteSchema = z.object({
	params: z.object({
		noteId: z.string().uuid("Invalid note id"),
	}),
});

export const FlagSchema = z.object({
	body: z.object({
		reason: z.string().min(1, "Reason is required").max(500, "Reason must be at most 500 characters"),
		// Positive = note for the record; negative = alert for Donna.
		type: z.enum(["positive", "negative"]).optional().default("negative"),
	}),
});

export const ClearFlagSchema = z.object({
	body: z.object({
		clearReason: z.string().min(1, "Clear reason is required").max(500, "Clear reason must be at most 500 characters"),
		// Optional — when the UI clears a specific flag from the history list,
		// only that flag is cleared. Without it, only the most recent open flag
		// is cleared (never all open flags at once).
		flagId: z.string().uuid().optional(),
	}),
});

export const IntakeSchema = z.object({
	body: z
		.object({
			// Webhook sends a single `name` (parsed from booking emails) — split
			// into first/last server-side. Explicit firstName/lastName overrides
			// win when provided. Some webhooks send firstName/lastName separately
			// (e.g. Make.com/Klarity), so name is optional when firstName is given.
			name: z.string().trim().optional(),
			firstName: z.string().trim().max(100).optional(),
			lastName: z.string().trim().max(100).optional(),
			email: z.string().email().optional().nullable(),
			phone: z.string().optional().nullable(),
			location: z.string().trim().max(200).optional().nullable(),
			// Webhook may send `locationName` instead of `location` (Make.com/Klarity format)
			locationName: z.string().trim().max(200).optional().nullable(),
			appointmentDatetime: z.string().datetime().optional().nullable(),
			// Webhook sends separate apptDate + apptStartTime instead of combined ISO datetime
			apptDate: z.string().optional().nullable(),
			apptStartTime: z.string().optional().nullable(),
			// Webhook sends patientDOB instead of dateOfBirth
			patientDOB: z.string().optional().nullable(),
			vaName: z.string().trim().max(100).optional().nullable(),
			// Explicit VA selection (e.g. from the Add Patient form's assign dropdown) —
			// takes priority over vaName matching and time-based auto-assignment.
			assignedTo: z.string().uuid().optional().nullable(),
			bookingPlatform: z
				.enum(["klarity", "zocdoc", "headway", "grow_therapy", "google", "phone", "walk_in"])
				.optional()
				.nullable(),
			problemDescription: z.string().max(2000).optional().nullable(),
			paymentMethod: z.string().max(100).optional().nullable(),
			insuranceProvider: z.string().max(200).optional().nullable(),
			paymentDetails: z.record(z.string(), z.unknown()).optional().nullable(),
			visitStatus: z.enum(["not_visited", "arrived", "no_show", "rescheduled"]).optional(),
			// Additional webhook fields from Make.com/Klarity
			purchaseAmount: z.string().optional().nullable(),
			appointmentId: z.string().optional().nullable(),
			practitionerName: z.string().optional().nullable(),
			practitionerID: z.string().optional().nullable(),
			tag: z.string().optional().nullable(),
			status: z.string().optional().nullable(),
			// Were previously absent from this schema entirely, so Zod silently
			// stripped them before the service layer ever saw them - added so
			// they land in paymentDetails alongside the other webhook metadata.
			apptEndTime: z.string().optional().nullable(),
			purchaseName: z.string().optional().nullable(),
		})
		.superRefine((val, ctx) => {
			// At least one of name or firstName must be present for patient creation.
			if (!val.name?.trim() && !val.firstName?.trim()) {
				ctx.addIssue({ code: "custom", path: ["firstName"], message: "Patient name or firstName is required" });
			}
		}),
});

export const CheckEligibilitySchema = z.object({
	body: z
		.object({
			paymentMethod: z.string().max(100).optional().nullable(),
			insuranceProvider: z.string().max(200).optional().nullable(),
			paymentDetails: z.record(z.string(), z.unknown()).optional().nullable(),
		})
		.optional(),
});

const moneyValue = z
	.string()
	.trim()
	.regex(/^\d+(\.\d{1,2})?$/, "Amount must be a number (e.g. 30 or 30.50)")
	.or(z.number().nonnegative());

// Date of birth is sent as "YYYY-MM-DD" from the UI (and may also arrive as a
// full ISO datetime from imports/webhooks), so accept any parseable date string.
const dateOfBirthValue = z
	.string()
	.trim()
	.optional()
	.nullable()
	.refine((v) => !v || !Number.isNaN(new Date(v).getTime()), "Date of birth must be a valid date");

export const UpdatePatientSchema = z.object({
	body: z.object({
		firstName: z.string().trim().max(100).optional().nullable(),
		lastName: z.string().trim().max(100).optional().nullable(),
		dateOfBirth: dateOfBirthValue,
		location: z.string().trim().max(200).optional().nullable(),
		email: z.string().trim().email().optional().nullable(),
		phone: z.string().trim().max(50).optional().nullable(),
		copayAmount: moneyValue.optional().nullable(),
		amountPaid: moneyValue.optional().nullable(),
		paymentMethod: z.string().trim().max(100).optional().nullable(),
		insuranceProvider: z.string().trim().max(200).optional().nullable(),
		visitStatus: z.enum(["not_visited", "arrived", "no_show", "rescheduled"]).optional(),
	}),
});

export const UpdateStatusSchema = z.object({
	body: z.object({
		status: z.enum(["active", "cancelled"]),
		reason: z.string().trim().max(300).optional().nullable(),
	}),
});

export const ClaimSchema = z.object({
	body: z.object({
		userId: z.string().uuid(),
	}),
});

export const UpdateAppointmentSchema = z.object({
	body: z.object({
		appointmentDatetime: z.string().datetime("Appointment datetime must be a valid ISO 8601 datetime"),
	}),
});

export type StageMoveInput = z.infer<typeof StageMoveSchema>["body"];
export type AssignInput = z.infer<typeof AssignSchema>["body"];
export type ChecklistToggleInput = z.infer<typeof ChecklistToggleSchema>["body"];
export type NotesInput = z.infer<typeof NotesSchema>["body"];
export type FlagInput = z.infer<typeof FlagSchema>["body"];
export type ClearFlagInput = z.infer<typeof ClearFlagSchema>["body"];
// Manual create from the authenticated Add Patient form — same body shape as
// the webhook intake (minus webhook-only fields) but the patient is created
// by a logged-in user, so the audit log records their identity.
export const CreatePatientSchema = z.object({
	body: z
		.object({
			// firstName/lastName are the source of truth — the Add Patient form
			// sends them separately. `name` is still accepted as a legacy fallback
			// and is split server-side when the parts aren't provided.
			firstName: z.string().trim().min(1, "First name is required").max(100).optional(),
			lastName: z.string().trim().max(100).optional(),
			name: z
				.string()
				.trim()
				.refine((v) => v.trim().length > 0, "Patient name cannot be empty")
				.optional(),
			email: z.string().email().optional().nullable(),
			phone: z.string().optional().nullable(),
			dateOfBirth: dateOfBirthValue,
			location: z.string().trim().max(200).optional().nullable(),
			appointmentDatetime: z.string().datetime().optional().nullable(),
			assignedTo: z.string().uuid().optional().nullable(),
			bookingPlatform: z
				.enum(["klarity", "zocdoc", "headway", "grow_therapy", "google", "phone", "walk_in"])
				.optional()
				.nullable(),
			problemDescription: z.string().max(2000).optional().nullable(),
			paymentMethod: z.string().max(100).optional().nullable(),
			insuranceProvider: z.string().max(200).optional().nullable(),
			visitStatus: z.enum(["not_visited", "arrived", "no_show", "rescheduled"]).optional(),
		})
		.superRefine((val, ctx) => {
			// At least one of firstName or legacy `name` must be present.
			if (!val.firstName?.trim() && !val.name?.trim()) {
				ctx.addIssue({ code: "custom", path: ["firstName"], message: "First name is required" });
			}
		}),
});

export type IntakeInput = z.infer<typeof IntakeSchema>["body"];
export type CreatePatientInput = z.infer<typeof CreatePatientSchema>["body"];
export type ClaimInput = z.infer<typeof ClaimSchema>["body"];
export type CheckEligibilityInput = z.infer<typeof CheckEligibilitySchema>["body"];
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>["body"];
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>["body"];
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema>["body"];
