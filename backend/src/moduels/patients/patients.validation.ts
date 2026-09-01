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

// --- Klarity webhook (POST /patients/intake/klarity) -----------------------
// Klarity posts a nested envelope: { source, eventType, appointment, patient,
// insurance, extra, meta }. Only `patient.firstName`/`lastName` and the
// appointment's id/clientId/startAt/endAt/appointmentStatus are contractually
// required; everything else is optional and may arrive as an explicit null.
// The payload also carries self-describing `_required`/`_optional`/
// `_notConfirmed` marker arrays — those are documentation, not data, so every
// object below is non-strict and simply ignores them.

/** Klarity sends numeric ids; accept either and normalize to string. */
const klarityId = z.union([z.string().trim().min(1), z.number()]).transform((v) => String(v));

/** Optional free-text that may arrive as null, "" or absent — all mean "no value". */
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

/**
 * The event types this endpoint acts on. Anything else is accepted and ignored
 * (202) rather than rejected, so a new Klarity event type does not turn into a
 * retry loop against a 4xx — see KLARITY_EVENT_TYPES usage in the service.
 */
export const KLARITY_EVENT_TYPES = [
	"appointment.created",
	"appointment.rescheduled",
	"appointment.canceled",
	"appointment.no_show",
	"appointment.completed",
] as const;

export type KlarityEventType = (typeof KLARITY_EVENT_TYPES)[number];

export const KlarityIntakeSchema = z.object({
	body: z.object({
		source: z.string().trim().optional().nullable(),
		// Kept as a free string, not an enum: an unrecognized event must reach the
		// service (which no-ops on it) instead of failing validation with a 400.
		eventType: z.string().trim().min(1, "eventType is required"),
		eventTimestamp: z.string().trim().optional().nullable(),

		appointment: z.object({
			id: klarityId,
			clientId: klarityId.optional().nullable(),
			// Required on every documented event, including the minimal
			// no_show/completed payloads.
			startAt: z.string().trim().min(1, "appointment.startAt is required"),
			endAt: z.string().trim().min(1, "appointment.endAt is required"),
			appointmentStatus: z.string().trim().min(1, "appointment.appointmentStatus is required"),
			appointmentName: optionalText(200),
			contactType: optionalText(50),
			serviceType: optionalText(100),
			serviceItemId: klarityId.optional().nullable(),
			serviceSpecialty: optionalText(100),
			providerFirstName: optionalText(100),
			providerLastName: optionalText(100),
			// Operational reason for the visit only — mapped to problemDescription,
			// the same field the existing intake and Add Patient form write to.
			reason: optionalText(2000),
			notes: optionalText(2000),
			intakeFormStatus: optionalText(50),
		}),

		// Optional at this layer because the lifecycle events (no_show, completed)
		// send an appointment-only payload with no patient block at all — those
		// resolve the existing record by appointment id instead. The service
		// enforces that appointment.created DOES carry a patient.
		patient: z
			.object({
				id: klarityId.optional().nullable(),
				firstName: z.string().trim().min(1, "patient.firstName is required").max(100),
				lastName: optionalText(100),
				preferredName: optionalText(100),
				// Klarity may send "" for a patient with no email on file; treat that
				// as absent rather than failing the whole webhook on a format error.
				email: z.preprocess(
					(v) => (typeof v === "string" && v.trim() === "" ? null : v),
					z.string().trim().email().optional().nullable(),
				),
				phone: optionalText(50),
				dob: optionalText(50),
				gender: optionalText(50),
				type: optionalText(50),
				status: optionalText(50),
			})
			.optional()
			.nullable(),

		insurance: z
			.object({
				primaryPayer: optionalText(200),
				memberId: optionalText(100),
				groupNumber: optionalText(100),
				planName: optionalText(200),
			})
			.optional()
			.nullable(),

		extra: z
			.object({
				location: optionalText(200),
				address: optionalText(300),
			})
			.optional()
			.nullable(),

		meta: z
			.object({
				vendor: optionalText(100),
				trigger: optionalText(100),
				syncVersion: optionalText(50),
			})
			.optional()
			.nullable(),
	}),
});

export type KlarityIntakeInput = z.infer<typeof KlarityIntakeSchema>["body"];
