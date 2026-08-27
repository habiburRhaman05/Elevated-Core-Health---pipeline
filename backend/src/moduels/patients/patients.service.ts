import { StatusCodes } from "http-status-codes";

import { isChecklistComplete } from "@/config/checklists";
import { isAdminOrAbove } from "@/config/roles";
import { getFirstStageKey, getStageOrder } from "@/config/stages";
import { audit } from "@/lib/audit";
import { isPatientInScope, patientScopeFor } from "@/lib/scope";
import type { AuthenticatedUser } from "@/lib/types";
import { emailService } from "@/services/email.service";
import { logger } from "@/utils/logger";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";
import type {
	AssignInput,
	CheckEligibilityInput,
	ChecklistToggleInput,
	ClaimInput,
	ClearFlagInput,
	CreatePatientInput,
	FlagInput,
	IntakeInput,
	NotesInput,
	StageMoveInput,
	UpdateAppointmentInput,
	UpdatePatientInput,
	UpdateStatusInput,
} from "./patients.validation";

/**
 * The DB no longer stores a single patient `name` — firstName/lastName are the
 * source of truth (legacy column dropped; migration backfilled first/last from
 * it). These helpers derive the full name for messages/emails and re-add it to
 * API responses so existing frontend code that reads `patient.name` keeps
 * working unchanged.
 */
function fullName(p: { firstName?: string | null; lastName?: string | null }): string {
	return [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
}

/** Split a single full-name string into first name + rest (webhook/legacy input). */
function splitName(full: string | null | undefined): { firstName: string; lastName: string | null } {
	const trimmed = (full ?? "").trim();
	if (!trimmed) return { firstName: "", lastName: null };
	const space = trimmed.indexOf(" ");
	if (space === -1) return { firstName: trimmed, lastName: null };
	return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1).trim() || null };
}

/** Add the computed full `name` back onto a patient row for API responses. */
function toPatientDto<T extends { firstName?: string | null; lastName?: string | null }>(p: T): T & { name: string } {
	return { ...p, name: fullName(p) };
}

function toPatientListDto<T extends { firstName?: string | null; lastName?: string | null }>(
	list: T[],
): Array<T & { name: string }> {
	return list.map((p) => ({ ...p, name: fullName(p) }));
}

/**
 * True when another patient already has this email (case-insensitive).
 * Emails are treated as unique identifiers for patients — the Add Patient form
 * and the webhook intake must not create duplicates.
 */
async function findDuplicateByEmail(email: string | null | undefined): Promise<boolean> {
	const normalized = email?.trim().toLowerCase();
	if (!normalized) return false;
	const existing = await prisma.patient.findFirst({
		where: { email: { equals: normalized, mode: "insensitive" } },
		select: { id: true },
	});
	return !!existing;
}

/**
 * Server-side simulated verification of benefits. In a later phase this will
 * call a real payer/clearinghouse API; for now it synthesizes realistic values
 * from the patient's stored payment data so the eligibility flow can be tested.
 */
function simulateVobSnapshot(
	patient: { id: string; insuranceProvider: string | null },
	input: Partial<{ insuranceProvider: string | null }> = {},
) {
	const payer = patient.insuranceProvider || input.insuranceProvider || "Blue Cross Blue Shield";
	const idTail = patient.id.replace(/-/g, "").slice(0, 8).toUpperCase();
	return {
		coverage: "Active",
		payer,
		memberId: `ECH${idTail}`,
		groupNumber: `G${idTail.slice(0, 6)}`,
		copay: "$30",
		coinsurance: "20%",
		deductible: "$1,500",
		deductibleMet: "$750",
		outOfPocketMax: "$5,000",
		authorizationRequired: false,
		visitsCoveredPerYear: "Unlimited",
		checkDate: new Date().toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		}),
	};
}

/** Resolve a rule's target field against the combined eligibility profile. */
function resolveField(profile: Record<string, unknown>, field: string): string {
	const key = field.trim().toLowerCase();
	if (key in profile) {
		const v = profile[key];
		return v === null || v === undefined ? "" : String(v);
	}
	// Support dotted paths into nested objects (e.g. paymentDetails.coverage)
	const parts = key.split(".");
	let cur: unknown = profile;
	for (const part of parts) {
		if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
			cur = (cur as Record<string, unknown>)[part];
		} else {
			return "";
		}
	}
	return cur === null || cur === undefined ? "" : String(cur);
}

function evaluateRule(
	rule: { label: string; field: string; operator: string; value: string | null },
	profile: Record<string, unknown>,
): boolean {
	const actual = resolveField(profile, rule.field).trim();
	const expected = (rule.value ?? "").trim();
	switch (rule.operator) {
		case "is_not_empty":
			return actual.length > 0;
		case "equals":
			return actual.toLowerCase() === expected.toLowerCase();
		case "contains":
			return expected.length > 0 && actual.toLowerCase().includes(expected.toLowerCase());
		case "is_empty":
			return actual.length === 0;
		default:
			return true;
	}
}

/**
 * Editing / ownership rule (task.md §7, §17: "Update patient - info - only
 * assigned va and admin"). admin/super_admin can edit any patient. A VA may
 * edit only a patient assigned to them, or an unclaimed one (assignedTo
 * null, so a freshly-booked patient stays workable by any VA until someone
 * claims it) — never another VA's patient. A privacy lock (set by the
 * assigned VA or admin) can further restrict even the owner's own teammates
 * on top of that ownership rule.
 */
function canEditPatient(
	patient: { isPrivate: boolean; privateLockedById: string | null; assignedTo: string | null },
	user: AuthenticatedUser,
): boolean {
	if (isAdminOrAbove(user.role)) return true;

	// Ownership: a VA may only work a patient assigned to them, or unclaimed.
	if (patient.assignedTo !== null && patient.assignedTo !== user.id) return false;

	if (patient.isPrivate) {
		if (patient.assignedTo === user.id) return true;
		if (patient.privateLockedById && patient.privateLockedById === user.id) return true;
		return false;
	}
	return true;
}

/**
 * Loose, word-overlap name match — NOT exact-string equality. Optimantra's
 * practitionerName can carry a title, suffix, or different word order than
 * whatever's saved as the VA's display name (e.g. webhook "Jude Smith, PA-C"
 * vs. a VA named "Jude - Lead"), so this strips punctuation and matches on
 * any single shared word of 2+ letters (a first name is normally enough).
 */
function fuzzyNameMatch(candidate: string, targetName: string | null | undefined): boolean {
	if (!targetName) return false;
	const words = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z\s]/g, " ")
			.split(/\s+/)
			.filter((w) => w.length > 1);
	const candidateWords = words(candidate);
	const targetWords = words(targetName);
	return candidateWords.some((w) => targetWords.includes(w));
}

/**
 * Shared VA auto-assignment for newly created patients (used by both webhook
 * intake and the authenticated Add Patient form). Priority: explicit VA
 * selection → webhook vaName match → webhook practitionerName match →
 * appointment-time rule (< 12 PM = Jude, ≥ 12 PM = Amanda). If no rule
 * matches, the patient stays unassigned.
 */
async function resolveAutoAssign(
	input: { assignedTo?: string | null; vaName?: string | null; practitionerName?: string | null },
	appointmentDatetime: Date | null,
): Promise<{ assignedTo: string | null; assignmentMethod: string }> {
	let assignedTo: string | null = null;
	let assignmentMethod = "none";

	const vas = await prisma.user.findMany({
		where: { role: "va" },
		select: { id: true, name: true },
	});

	// 0. Explicit assignment (e.g. picked from a dropdown in the Add Patient form)
	if (input.assignedTo) {
		const explicitVa = vas.find((va) => va.id === input.assignedTo);
		if (explicitVa) {
			assignedTo = explicitVa.id;
			assignmentMethod = "explicit_selection";
		}
	}

	// 1. If vaName provided in webhook, try to find and assign to that VA
	if (!assignedTo && input.vaName && input.vaName.trim()) {
		const namedVa = vas.find((va) => va.name?.toLowerCase().includes(input.vaName!.toLowerCase()));
		if (namedVa) {
			assignedTo = namedVa.id;
			assignmentMethod = `webhook_va_name (${input.vaName})`;
		}
	}

	// 1.5. If still unassigned, try the webhook's practitionerName against a
	// VA's own name - fuzzy word-overlap, not an exact match (see
	// fuzzyNameMatch's doc comment for why exact matching isn't reliable
	// here). This is for clinics where a given practitioner's patients are
	// always meant to land with a specific VA.
	if (!assignedTo && input.practitionerName && input.practitionerName.trim()) {
		const matchedVa = vas.find((va) => fuzzyNameMatch(input.practitionerName as string, va.name));
		if (matchedVa) {
			assignedTo = matchedVa.id;
			assignmentMethod = `webhook_practitioner_name (${input.practitionerName})`;
		}
	}

	// 2. If not assigned yet and appointment time provided, use time-based assignment
	if (!assignedTo && appointmentDatetime) {
		const appointmentHour = appointmentDatetime.getHours();
		const jude = vas.find((va) => va.name?.toLowerCase().includes("jude"));
		const amanda = vas.find((va) => va.name?.toLowerCase().includes("amanda"));

		assignedTo = appointmentHour < 12 ? (jude?.id ?? null) : (amanda?.id ?? null);
		if (assignedTo) {
			assignmentMethod = "appointment_time";
		}
	}

	return { assignedTo, assignmentMethod };
}

const patientInclude = {
	assignedUser: { select: { id: true, name: true } },
	createdByUser: { select: { id: true, name: true } },
	// Role is included on flag-related users so the UI can distinguish
	// admin-raised flags (oversight) from VA-raised flags without a lookup.
	flaggedByUser: { select: { id: true, name: true, role: true } },
	flagClearedByUser: { select: { id: true, name: true, role: true } },
	cancelledByUser: { select: { id: true, name: true } },
	privateLockedByUser: { select: { id: true, name: true } },
	// Full flag history (newest first). The patient row keeps its single
	// "currently flagged" snapshot for cheap board badges; this array feeds
	// the modal's latest-flag + count + view-all list.
	flags: {
		orderBy: { createdAt: "desc" },
		include: {
			flaggedByUser: { select: { id: true, name: true, role: true } },
			clearedByUser: { select: { id: true, name: true, role: true } },
		},
	},
	// Full note history (newest first), same pattern as flags — each note is
	// its own row. The legacy `notes` scalar still exists for old rows but is
	// no longer written; the UI reads this array instead.
	patientNotes: {
		orderBy: { createdAt: "desc" },
		include: {
			createdByUser: { select: { id: true, name: true, role: true } },
		},
	},
} as const;

export const patientsService = {
	/**
	 * task.md §17: admin/super_admin see every patient; a VA sees only their
	 * own assigned patients plus the unassigned pool — never another VA's
	 * patients. `patientScopeFor` returns `{}` for admin/super_admin, so this
	 * is a no-op for them.
	 */
	async list(stage: string | undefined, user: AuthenticatedUser) {
		const where = { ...(stage ? { stage } : {}), ...patientScopeFor(user) };
		const patients = await prisma.patient.findMany({
			where,
			orderBy: { updatedAt: "desc" },
			include: patientInclude,
		});
		return ServiceResponse.success("Patients retrieved.", toPatientListDto(patients));
	},

	async getById(id: string, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({
			where: { id },
			include: {
				...patientInclude,
				activityLogs: { orderBy: { createdAt: "desc" }, take: 50 },
			},
		});
		// Out-of-scope patients are reported as 404, not 403 — a VA probing IDs
		// should not be able to tell "doesn't exist" from "belongs to someone else".
		if (!patient || !isPatientInScope(patient, user)) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}
		return ServiceResponse.success("Patient retrieved.", toPatientDto(patient));
	},

	async moveStage(id: string, input: StageMoveInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		if (!canEditPatient(patient, user)) {
			return ServiceResponse.failure(
				"This patient is assigned to another VA, or currently locked. Only the assigned VA or an admin can move it.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		const order = await getStageOrder();
		if (!order.includes(input.targetStage)) {
			return ServiceResponse.failure("Target stage does not exist or is disabled.", null, StatusCodes.BAD_REQUEST);
		}

		const curIdx = order.indexOf(patient.stage);
		const tgtIdx = order.indexOf(input.targetStage);

		if (tgtIdx - curIdx > 1) {
			return ServiceResponse.failure(
				"Cannot skip stages. Move forward one stage at a time.",
				null,
				StatusCodes.BAD_REQUEST,
			);
		}

		if (tgtIdx > curIdx) {
			const allState = (patient.checklistState ?? {}) as Record<string, Record<string, boolean>>;
			const stageState = allState[patient.stage] ?? {};
			const complete = await isChecklistComplete(patient.stage, stageState);
			if (!complete) {
				return ServiceResponse.failure(
					"Please complete all checklist items before moving to the next stage.",
					null,
					StatusCodes.BAD_REQUEST,
				);
			}
		}

		// Auto-complete: entering a final stage marks the patient Completed;
		// leaving a final stage while Completed reverts to Active.
		const targetStage = await prisma.stage.findUnique({
			where: { key: input.targetStage },
			select: { isFinal: true },
		});
		const data: Record<string, unknown> = { stage: input.targetStage, updatedAt: new Date(), updatedById: user.id };
		if (targetStage?.isFinal && patient.status !== "cancelled") {
			data.status = "completed";
			data.completedAt = new Date();
		} else if (patient.status === "completed" && !targetStage?.isFinal) {
			data.status = "active";
			data.completedAt = null;
		}

		const updated = await prisma.patient.update({ where: { id }, data });

		await audit({
			patientId: id,
			user,
			action: "stage.move",
			entityType: "stage",
			entityId: input.targetStage,
			prevValue: { stage: patient.stage },
			newValue: { stage: input.targetStage },
			message: `Moved from ${patient.stage} to ${input.targetStage}`,
			type: "auto",
		});

		return ServiceResponse.success("Stage updated.", toPatientDto(updated));
	},

	async assign(id: string, input: AssignInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		// Lock-aware: a VA must never self-assign a locked patient to bypass the lock.
		if (!canEditPatient(patient, user)) {
			return ServiceResponse.failure(
				"This patient is assigned to another VA, or currently locked. Only the assigned VA or an admin can reassign it.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		const updated = await prisma.patient.update({
			where: { id },
			data: { assignedTo: input.assignedTo, updatedAt: new Date(), updatedById: user.id },
		});

		const assignedName = input.assignedTo
			? (await prisma.user.findUnique({ where: { id: input.assignedTo }, select: { name: true } }))?.name
			: null;

		await audit({
			patientId: id,
			user,
			action: "assignment.change",
			entityType: "patient",
			entityId: id,
			prevValue: { assignedTo: patient.assignedTo },
			newValue: { assignedTo: input.assignedTo, name: assignedName },
			message: assignedName ? `Assigned patient to ${assignedName}` : "Unassigned patient",
		});

		return ServiceResponse.success("Assignment updated.", toPatientDto(updated));
	},

	async toggleChecklist(id: string, input: ChecklistToggleInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		if (!canEditPatient(patient, user)) {
			return ServiceResponse.failure(
				"This patient is assigned to another VA, or currently locked. Only the assigned VA or an admin can update it.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		const state = { ...((patient.checklistState ?? {}) as Record<string, Record<string, boolean>>) };

		const currentStage = patient.stage;
		if (!state[currentStage]) {
			state[currentStage] = {};
		}
		state[currentStage][input.itemId] = input.checked;

		const item = await prisma.checklistItem.findUnique({ where: { id: input.itemId } });

		const updated = await prisma.patient.update({
			where: { id },
			data: { checklistState: state, updatedAt: new Date(), updatedById: user.id },
		});

		const action = input.checked ? "checked" : "unchecked";
		const label = item?.label ?? input.itemId;
		await audit({
			patientId: id,
			user,
			action: "checklist.toggle",
			entityType: "checklist_item",
			entityId: input.itemId,
			prevValue: { checked: !input.checked },
			newValue: { checked: input.checked },
			metadata: { stage: currentStage, label },
			message: `Checklist item "${label}" ${action}`,
			type: "auto",
		});

		return ServiceResponse.success("Checklist updated.", toPatientDto(updated));
	},

	/**
	 * Adds a new note to the patient's note history (each note is its own row,
	 * like PatientFlag). The legacy single `notes` scalar is no longer written.
	 */
	async createNote(id: string, input: NotesInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		if (!canEditPatient(patient, user)) {
			return ServiceResponse.failure(
				"This patient is assigned to another VA, or currently locked. Only the assigned VA or an admin can update it.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		await prisma.patientNote.create({
			data: {
				patientId: id,
				content: input.content,
				createdById: user.id,
			},
		});

		// Touch the patient so the board's stale flag stays accurate.
		await prisma.patient.update({
			where: { id },
			data: { updatedAt: new Date(), updatedById: user.id },
		});

		const updated = await prisma.patient.findUniqueOrThrow({
			where: { id },
			include: patientInclude,
		});

		await audit({
			patientId: id,
			user,
			action: "notes.create",
			entityType: "patient",
			entityId: id,
			newValue: { content: input.content },
			message: `Note added: "${input.content.slice(0, 60)}${input.content.length > 60 ? "..." : ""}"`,
		});

		return ServiceResponse.success("Note added.", toPatientDto(updated));
	},

	/** Deletes a single note from the patient's note history. */
	async deleteNote(id: string, noteId: string, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		if (!canEditPatient(patient, user)) {
			return ServiceResponse.failure(
				"This patient is assigned to another VA, or currently locked. Only the assigned VA or an admin can update it.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		const note = await prisma.patientNote.findFirst({
			where: { id: noteId, patientId: id },
		});
		if (!note) {
			return ServiceResponse.failure("Note not found.", null, StatusCodes.NOT_FOUND);
		}

		await prisma.patientNote.delete({ where: { id: noteId } });

		// Touch the patient so the board's stale flag stays accurate.
		await prisma.patient.update({
			where: { id },
			data: { updatedAt: new Date(), updatedById: user.id },
		});

		const updated = await prisma.patient.findUniqueOrThrow({
			where: { id },
			include: patientInclude,
		});

		await audit({
			patientId: id,
			user,
			action: "notes.delete",
			entityType: "patient",
			entityId: id,
			prevValue: { noteId, content: note.content },
			message: `Note deleted: "${note.content.slice(0, 60)}${note.content.length > 60 ? "..." : ""}"`,
		});

		return ServiceResponse.success("Note deleted.", toPatientDto(updated));
	},

	async flag(id: string, input: FlagInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		const updated = await prisma.patient.update({
			where: { id },
			data: {
				isFlagged: true,
				flagReason: input.reason,
				flaggedById: user.id,
				flaggedAt: new Date(),
				updatedAt: new Date(),
				updatedById: user.id,
			},
		});

		// Write the flag into history (kept in sync with the patient snapshot).
		await prisma.patientFlag.create({
			data: {
				patientId: id,
				stage: patient.stage,
				type: input.type ?? "negative",
				reason: input.reason,
				flaggedById: user.id,
			},
		});

		await audit({
			patientId: id,
			user,
			action: "flag.create",
			entityType: "patient",
			entityId: id,
			prevValue: { isFlagged: false },
			newValue: { isFlagged: true, reason: input.reason },
			message: `Flagged for Donna: ${input.reason}`,
		});

		try {
			const admin = await prisma.user.findFirst({
				where: { role: { in: ["admin", "super_admin"] } },
				select: { email: true },
			});
			if (admin) {
				await emailService.notifyFlagged(fullName(patient), user.name, input.reason, admin.email);
			}
		} catch (err) {
			logger.error({ err, patientId: id }, "Failed to send flag notification email");
		}

		return ServiceResponse.success("Patient flagged.", toPatientDto(updated));
	},

	async clearFlag(id: string, input: ClearFlagInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		// Resolve which SINGLE flag to clear: the one the UI clicked (flagId),
		// or the most recent open flag as a fallback (e.g. the admin home page
		// "Clear Flag" row). Never clear every open flag at once — each flag is
		// resolved independently and keeps its own clear reason.
		let targetFlagId: string | null = null;
		if (input.flagId) {
			const target = await prisma.patientFlag.findFirst({
				where: { id: input.flagId, patientId: id },
				select: { id: true, clearedAt: true },
			});
			if (!target) {
				return ServiceResponse.failure("Flag not found for this patient.", null, StatusCodes.NOT_FOUND);
			}
			if (target.clearedAt) {
				return ServiceResponse.failure("This flag is already cleared.", null, StatusCodes.CONFLICT);
			}
			targetFlagId = target.id;
		} else {
			const latestOpen = await prisma.patientFlag.findFirst({
				where: { patientId: id, clearedAt: null },
				orderBy: { createdAt: "desc" },
				select: { id: true },
			});
			targetFlagId = latestOpen?.id ?? null;
		}

		if (targetFlagId) {
			await prisma.patientFlag.update({
				where: { id: targetFlagId },
				data: {
					clearedById: user.id,
					clearedReason: input.clearReason,
					clearedAt: new Date(),
				},
			});
		}

		// Re-check remaining open flags to decide the patient snapshot state.
		const remainingOpen = await prisma.patientFlag.count({
			where: { patientId: id, clearedAt: null },
		});

		const snapshot: Record<string, unknown> = { updatedAt: new Date(), updatedById: user.id };
		if (remainingOpen === 0) {
			snapshot.isFlagged = false;
			snapshot.flagReason = null;
			snapshot.flaggedById = null;
			snapshot.flaggedAt = null;
			snapshot.flagClearedReason = input.clearReason;
			snapshot.flagClearedById = user.id;
			snapshot.flagClearedAt = new Date();
		} else {
			// Other flags are still open — keep the patient flagged and point the
			// snapshot at the most recent remaining open flag.
			const latestOpen = await prisma.patientFlag.findFirst({
				where: { patientId: id, clearedAt: null },
				orderBy: { createdAt: "desc" },
				select: { reason: true, flaggedById: true, createdAt: true },
			});
			if (latestOpen) {
				snapshot.flagReason = latestOpen.reason;
				snapshot.flaggedById = latestOpen.flaggedById;
				snapshot.flaggedAt = latestOpen.createdAt;
				snapshot.flagClearedReason = null;
				snapshot.flagClearedById = null;
				snapshot.flagClearedAt = null;
			}
		}

		const updated = await prisma.patient.update({ where: { id }, data: snapshot });

		await audit({
			patientId: id,
			user,
			action: "flag.clear",
			entityType: "patient_flag",
			entityId: targetFlagId ?? id,
			prevValue: { isFlagged: true },
			newValue: { isFlagged: remainingOpen === 0, reason: input.clearReason },
			message: `Flag cleared - ${input.clearReason}`,
		});

		// Email the flagger of the cleared flag with Donna's feedback (only the
		// person who raised the flag we actually cleared).
		try {
			const clearedFlag = targetFlagId
				? await prisma.patientFlag.findUnique({
						where: { id: targetFlagId },
						include: { flaggedByUser: { select: { email: true, name: true } } },
					})
				: null;
			if (clearedFlag?.flaggedByUser?.email) {
				await emailService.notifyFlagCleared(
					fullName(patient),
					user.name,
					input.clearReason,
					clearedFlag.flaggedByUser.email,
				);
			}
		} catch (err) {
			logger.error({ err, patientId: id }, "Failed to send flag-cleared notification email");
		}

		return ServiceResponse.success("Flag cleared.", toPatientDto(updated));
	},

	async deletePatient(id: string) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		await prisma.patient.delete({ where: { id } });
		return ServiceResponse.success("Patient deleted.", null);
	},

	async updatePatient(id: string, input: UpdatePatientInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		if (!canEditPatient(patient, user)) {
			return ServiceResponse.failure(
				"This patient is assigned to another VA, or currently locked. Only the assigned VA or an admin can update it.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		const data: Record<string, unknown> = {};
		const prev: Record<string, unknown> = {};
		const next: Record<string, unknown> = {};

		const firstName = input.firstName !== undefined ? (input.firstName ?? null) : null;
		const lastName = input.lastName !== undefined ? (input.lastName ?? null) : null;
		if (input.firstName !== undefined) {
			data.firstName = input.firstName;
			prev.firstName = patient.firstName;
			next.firstName = input.firstName;
		}
		if (input.lastName !== undefined) {
			data.lastName = input.lastName;
			prev.lastName = patient.lastName;
			next.lastName = input.lastName;
		}
		// NOTE: no `name` sync needed — firstName/lastName are the source of
		// truth in the DB; the API derives the full name at serialization time.
		if (input.location !== undefined) {
			data.location = input.location;
			prev.location = patient.location;
			next.location = input.location;
		}
		if (input.email !== undefined) {
			data.email = input.email;
			prev.email = patient.email;
			next.email = input.email;
		}
		if (input.phone !== undefined) {
			data.phone = input.phone;
			prev.phone = patient.phone;
			next.phone = input.phone;
		}
		if (input.dateOfBirth !== undefined) {
			data.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
			prev.dateOfBirth = patient.dateOfBirth;
			next.dateOfBirth = data.dateOfBirth;
		}
		if (input.copayAmount !== undefined) {
			data.copayAmount = input.copayAmount === null || input.copayAmount === "" ? null : String(input.copayAmount);
			prev.copayAmount = patient.copayAmount?.toString() ?? null;
			next.copayAmount = data.copayAmount;
		}
		if (input.amountPaid !== undefined) {
			data.amountPaid = input.amountPaid === null || input.amountPaid === "" ? null : String(input.amountPaid);
			prev.amountPaid = patient.amountPaid?.toString() ?? null;
			next.amountPaid = data.amountPaid;
		}
		if (input.paymentMethod !== undefined) {
			data.paymentMethod = input.paymentMethod;
			prev.paymentMethod = patient.paymentMethod;
			next.paymentMethod = input.paymentMethod;
		}
		if (input.insuranceProvider !== undefined) {
			data.insuranceProvider = input.insuranceProvider;
			prev.insuranceProvider = patient.insuranceProvider;
			next.insuranceProvider = input.insuranceProvider;
		}
		if (input.visitStatus !== undefined) {
			data.visitStatus = input.visitStatus;
			prev.visitStatus = patient.visitStatus;
			next.visitStatus = input.visitStatus;
		}

		data.updatedAt = new Date();
		data.updatedById = user.id;

		const updated = await prisma.patient.update({ where: { id }, data });

		await audit({
			patientId: id,
			user,
			action: "patient.update",
			entityType: "patient",
			entityId: id,
			prevValue: prev,
			newValue: next,
			message: "Updated patient details",
		});

		return ServiceResponse.success("Patient updated.", toPatientDto(updated));
	},

	async lockPatient(id: string, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		if (!isAdminOrAbove(user.role) && patient.assignedTo !== user.id) {
			return ServiceResponse.failure(
				"Only the assigned VA or an admin can lock this patient.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		const updated = await prisma.patient.update({
			where: { id },
			data: {
				isPrivate: true,
				privateLockedById: user.id,
				privateLockedAt: new Date(),
				updatedAt: new Date(),
				updatedById: user.id,
			},
		});

		await audit({
			patientId: id,
			user,
			action: "lock.set",
			entityType: "patient",
			entityId: id,
			prevValue: { isPrivate: false },
			newValue: { isPrivate: true },
			message: "Locked patient - only the assigned VA or an admin can edit",
		});

		return ServiceResponse.success("Patient locked.", toPatientDto(updated));
	},

	async unlockPatient(id: string, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		const canUnlock =
			isAdminOrAbove(user.role) || patient.assignedTo === user.id || patient.privateLockedById === user.id;
		if (!canUnlock) {
			return ServiceResponse.failure(
				"Only the assigned VA, the person who locked it, or an admin can unlock this patient.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		const updated = await prisma.patient.update({
			where: { id },
			data: {
				isPrivate: false,
				privateLockedById: null,
				privateLockedAt: null,
				updatedAt: new Date(),
				updatedById: user.id,
			},
		});

		await audit({
			patientId: id,
			user,
			action: "lock.clear",
			entityType: "patient",
			entityId: id,
			prevValue: { isPrivate: true },
			newValue: { isPrivate: false },
			message: "Unlocked patient - open for all VAs again",
		});

		return ServiceResponse.success("Patient unlocked.", toPatientDto(updated));
	},

	async updateStatus(id: string, input: UpdateStatusInput, user: AuthenticatedUser) {
		if (!isAdminOrAbove(user.role)) {
			return ServiceResponse.failure("Only admins can change patient status.", null, StatusCodes.FORBIDDEN);
		}

		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		const data: Record<string, unknown> = { status: input.status, updatedAt: new Date(), updatedById: user.id };
		if (input.status === "cancelled") {
			data.cancelledAt = new Date();
			data.cancelledById = user.id;
			data.cancelledReason = input.reason ?? null;
			data.completedAt = null;
		} else if (input.status === "active") {
			data.cancelledAt = null;
			data.cancelledById = null;
			data.cancelledReason = null;
		}

		const updated = await prisma.patient.update({ where: { id }, data });

		await audit({
			patientId: id,
			user,
			action: "status.update",
			entityType: "patient",
			entityId: id,
			prevValue: { status: patient.status },
			newValue: { status: input.status, reason: input.reason ?? null },
			message: `Status changed from ${patient.status} to ${input.status}${input.reason ? ` - ${input.reason}` : ""}`,
		});

		return ServiceResponse.success("Status updated.", toPatientDto(updated));
	},

	async claim(id: string, input: ClaimInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		if (patient.assignedTo) {
			return ServiceResponse.failure("Patient is already assigned.", null, StatusCodes.CONFLICT);
		}

		const updated = await prisma.patient.update({
			where: { id },
			data: { assignedTo: input.userId, updatedAt: new Date(), updatedById: user.id },
		});

		await audit({
			patientId: id,
			user,
			action: "assignment.claim",
			entityType: "patient",
			entityId: id,
			prevValue: { assignedTo: null },
			newValue: { assignedTo: input.userId },
			message: `Claimed responsibility for patient`,
		});

		try {
			const vas = await prisma.user.findMany({ where: { role: "va" }, select: { id: true, name: true, email: true } });
			const otherVa = vas.find((v) => v.id !== input.userId);
			if (otherVa) {
				await emailService.notifyClaimed(fullName(patient), user.name, otherVa.email);
			}
		} catch (err) {
			logger.error({ err, patientId: id }, "Failed to send claim notification email");
		}

		return ServiceResponse.success("Patient claimed.", toPatientDto(updated));
	},

	async listChecklistItems() {
		const items = await prisma.checklistItem.findMany({
			orderBy: [{ stage: "asc" }, { sortOrder: "asc" }],
			select: { id: true, stage: true, label: true, description: true, status: true, isDefault: true, sortOrder: true },
		});
		return ServiceResponse.success("Checklist items retrieved.", items);
	},

	async checkEligibility(id: string, input: CheckEligibilityInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		const body = input ?? {};

		if (!canEditPatient(patient, user)) {
			return ServiceResponse.failure(
				"This patient is assigned to another VA, or currently locked. Only the assigned VA or an admin can run eligibility checks.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		// 1. Persist any payment info supplied during the check (e.g. from a VA
		//    reading the card / insurance details). Webhook intake data is also
		//    stored on the patient, so rules see everything.
		const paymentData: Record<string, unknown> = {};
		if (body.paymentMethod !== undefined) paymentData.paymentMethod = body.paymentMethod;
		if (body.insuranceProvider !== undefined) paymentData.insuranceProvider = body.insuranceProvider;
		if (body.paymentDetails !== undefined) paymentData.paymentDetails = body.paymentDetails;

		let latest = patient;
		if (Object.keys(paymentData).length > 0) {
			latest = await prisma.patient.update({
				where: { id },
				data: { ...paymentData, updatedAt: new Date(), updatedById: user.id },
			});
		}

		// 2. Build the profile used to evaluate the rules: stored payment fields +
		//    the simulated VOB snapshot.
		const vob = simulateVobSnapshot(patient, { insuranceProvider: latest.insuranceProvider });
		const storedDetails = (latest.paymentDetails ?? {}) as Record<string, unknown>;
		const profile: Record<string, unknown> = {
			paymentMethod: latest.paymentMethod ?? "",
			insuranceProvider: latest.insuranceProvider ?? "",
			paymentDetails: storedDetails,
			...vob,
		};

		// 3. Evaluate every active rule against the profile.
		const rules = await prisma.eligibilityRule.findMany({
			where: { isActive: true },
			orderBy: { createdAt: "asc" },
		});

		const failed: string[] = [];
		for (const rule of rules) {
			if (!evaluateRule(rule, profile)) {
				failed.push(rule.label);
			}
		}

		const isEligible = rules.length === 0 ? true : failed.length === 0;
		const status = isEligible ? "eligible" : "not_eligible";
		const reason = failed.length > 0 ? `Failed: ${failed.join("; ")}` : null;

		// 4. Persist the result.
		const updated = await prisma.patient.update({
			where: { id },
			data: {
				eligibilityStatus: status,
				eligibilityCheckedAt: new Date(),
				eligibilityDetails: { vob, evaluatedRules: rules.length },
				eligibilityReason: reason,
				updatedAt: new Date(),
				updatedById: user.id,
			},
			include: {
				assignedUser: { select: { id: true, name: true } },
				flaggedByUser: { select: { id: true, name: true } },
				flagClearedByUser: { select: { id: true, name: true } },
			},
		});

		await audit({
			patientId: id,
			user,
			action: "eligibility.check",
			entityType: "patient",
			entityId: id,
			prevValue: { eligibilityStatus: patient.eligibilityStatus },
			newValue: { eligibilityStatus: status, reason },
			message: `Eligibility check completed - ${status === "eligible" ? "Eligible" : "Not Eligible"}${reason ? ` (${reason})` : ""}`,
			type: "auto",
		});

		return ServiceResponse.success(
			status === "eligible" ? "Patient is eligible." : "Patient is not eligible.",
			toPatientDto(updated),
		);
	},

	async intake(input: IntakeInput) {
		// --- Webhook field mapping (Make.com/Klarity format → Patient model) ---
		// The webhook sends: firstName, lastName, locationName, apptDate, apptStartTime,
		// patientDOB, purchaseAmount, appointmentId, practitionerName, etc.
		// We map these to the Patient schema fields.

		logger.info(
			{ firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone },
			"Webhook intake - processing patient data",
		);

		// Safely parse appointment datetime from separate fields if not provided as ISO
		let appointmentDatetime: Date | null = null;
		try {
			if (input.appointmentDatetime) {
				const parsed = new Date(input.appointmentDatetime);
				if (!Number.isNaN(parsed.getTime())) {
					appointmentDatetime = parsed;
				}
			} else if (input.apptDate && input.apptStartTime) {
				// apptDate arrives as a FULL date+time string (e.g. "Sat Aug 22
				// 04:00:00 2026") whose time portion is Optimantra's own
				// placeholder, not the real appointment time - apptStartTime
				// ("21:00") is the actual time. Naively concatenating the two
				// strings (the old approach) produces something like
				// "Sat Aug 22 04:00:00 2026 21:00", which `new Date(...)` can't
				// parse at all - confirmed live, this silently dropped the
				// appointment date on every webhook intake. Instead: parse
				// apptDate for its calendar date only, then apply
				// apptStartTime's hour/minute on top of that same date.
				const dateOnly = new Date(input.apptDate);
				const timeMatch = input.apptStartTime.match(/^(\d{1,2}):(\d{2})/);
				if (!Number.isNaN(dateOnly.getTime()) && timeMatch) {
					const combined = new Date(dateOnly);
					combined.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
					appointmentDatetime = combined;
				} else {
					logger.warn(
						{ apptDate: input.apptDate, apptStartTime: input.apptStartTime },
						"Could not parse webhook appointment date fields",
					);
				}
			}
		} catch (err) {
			logger.warn(
				{ err, apptDate: input.apptDate, apptStartTime: input.apptStartTime },
				"Failed to parse appointment datetime from webhook",
			);
		}

		// Safely parse date of birth from patientDOB field (e.g. "2007-01-20")
		let dateOfBirth: Date | null = null;
		if (input.patientDOB) {
			try {
				const parsed = new Date(input.patientDOB);
				if (!Number.isNaN(parsed.getTime())) {
					dateOfBirth = parsed;
				} else {
					logger.warn({ patientDOB: input.patientDOB }, "Could not parse patient date of birth");
				}
			} catch (err) {
				logger.warn({ err, patientDOB: input.patientDOB }, "Failed to parse patientDOB");
			}
		}

		// Map locationName to location (fallback gracefully)
		const location = input.location?.trim() || input.locationName?.trim() || null;

		// Validate name — required for patient creation
		const firstName = input.firstName?.trim() || splitName(input.name).firstName;
		if (!firstName) {
			return ServiceResponse.failure(
				"Patient first name is required. The webhook did not provide a name or firstName field.",
				null,
				StatusCodes.BAD_REQUEST,
			);
		}
		const lastName = input.lastName?.trim() || splitName(input.name).lastName || null;

		const firstStage = await getFirstStageKey(); // Should be "onboarding"

		// Normalize phone for duplicate check (strip non-digits)
		const normalizedPhone = input.phone?.replace(/\D/g, "") || null;

		// Reject re-pushes of a patient that already exists (same email OR same phone).
		if (input.email) {
			if (await findDuplicateByEmail(input.email)) {
				return ServiceResponse.failure(
					"A patient with this email already exists. Intake skipped to avoid a duplicate record.",
					null,
					StatusCodes.CONFLICT,
				);
			}
		}
		if (normalizedPhone && normalizedPhone.length >= 10) {
			const existingByPhone = await prisma.patient.findFirst({
				where: { phone: { contains: normalizedPhone, mode: "insensitive" } },
				select: { id: true, firstName: true, lastName: true },
			});
			if (existingByPhone) {
				logger.warn(
					{ phone: input.phone, existingPatientId: existingByPhone.id },
					"Duplicate phone detected, skipping intake",
				);
				return ServiceResponse.failure(
					`A patient with this phone number already exists (${existingByPhone.firstName} ${existingByPhone.lastName ?? ""}). Intake skipped to avoid a duplicate record.`,
					null,
					StatusCodes.CONFLICT,
				);
			}
		}

		// Auto-assign VA: explicit selection wins, then vaName from webhook, then appointment time
		const { assignedTo, assignmentMethod } = await resolveAutoAssign(input, appointmentDatetime);

		// Safely build paymentDetails JSON with webhook metadata
		const webhookMetadata: Record<string, unknown> = {};
		if (input.appointmentId) webhookMetadata.appointmentId = String(input.appointmentId).trim();
		if (input.practitionerName) webhookMetadata.practitionerName = String(input.practitionerName).trim();
		if (input.practitionerID) webhookMetadata.practitionerID = String(input.practitionerID).trim();
		if (input.tag) webhookMetadata.tag = String(input.tag).trim();
		if (input.status) webhookMetadata.bookingStatus = String(input.status).trim();
		if (input.apptEndTime) webhookMetadata.apptEndTime = String(input.apptEndTime).trim();
		if (input.purchaseName) webhookMetadata.purchaseName = String(input.purchaseName).trim();

		// Safely merge with any existing paymentDetails from input
		let existingDetails: Record<string, unknown> = {};
		try {
			if (input.paymentDetails && typeof input.paymentDetails === "object") {
				existingDetails = input.paymentDetails as Record<string, unknown>;
			}
		} catch {
			logger.warn({ paymentDetails: input.paymentDetails }, "Could not parse webhook paymentDetails");
		}
		const paymentDetails = { ...existingDetails, ...webhookMetadata };

		// Safely parse purchaseAmount as copayAmount
		let copayAmount: string | null = null;
		if (input.purchaseAmount) {
			const amt = String(input.purchaseAmount).trim();
			if (/^\d+(\.\d{1,2})?$/.test(amt)) {
				copayAmount = amt;
			} else {
				logger.warn({ purchaseAmount: input.purchaseAmount }, "Invalid purchaseAmount format, skipping copayAmount");
			}
		}

		const patient = await prisma.patient.create({
			data: {
				// firstName/lastName are the source of truth. The webhook sends a
				// single `name` (parsed from booking emails) — split it, or use
				// explicit overrides when provided.
				firstName,
				lastName,
				email: input.email?.trim() || null,
				phone: input.phone?.trim() || null,
				location,
				dateOfBirth,
				stage: firstStage, // Always "onboarding" for new patients
				appointmentDatetime,
				bookingPlatform: input.bookingPlatform ?? null,
				problemDescription: input.problemDescription?.trim() || null,
				paymentMethod: input.paymentMethod?.trim() || null,
				insuranceProvider: input.insuranceProvider?.trim() || null,
				paymentDetails: Object.keys(paymentDetails).length > 0 ? JSON.parse(JSON.stringify(paymentDetails)) : undefined,
				copayAmount,
				visitStatus: input.visitStatus ?? undefined,
				source: "webhook",
				checklistState: {},
				notes: input.practitionerName?.trim() ? `Practitioner: ${input.practitionerName.trim()}` : null,
				assignedTo,
			},
		});

		logger.info(
			{
				patientId: patient.id,
				firstName: patient.firstName,
				lastName: patient.lastName,
				email: patient.email,
				phone: patient.phone,
				location: patient.location,
				dateOfBirth: patient.dateOfBirth,
				stage: patient.stage,
				appointmentDatetime: patient.appointmentDatetime,
				bookingPlatform: patient.bookingPlatform,
				copayAmount: patient.copayAmount,
				source: patient.source,
				assignedTo: patient.assignedTo,
			},
			"Webhook intake - patient created successfully",
		);

		const platformLabel = input.bookingPlatform ?? "email";
		const assignmentNote = assignedTo ? ` - Auto-assigned via ${assignmentMethod}` : "";
		await audit({
			patientId: patient.id,
			user: null,
			action: "patient.create",
			entityType: "patient",
			entityId: patient.id,
			newValue: { source: "webhook", platform: platformLabel, assignedTo, assignmentMethod },
			message: `New patient auto-created from booking email (${platformLabel})${assignmentNote}`,
			type: "auto",
		});

		try {
			const vas = await prisma.user.findMany({ where: { role: "va" }, select: { email: true } });
			const vaEmails = vas.map((v) => v.email).filter(Boolean) as string[];
			if (vaEmails.length > 0) {
				const appointmentStr = appointmentDatetime
					? appointmentDatetime.toLocaleDateString("en-US", {
							weekday: "short",
							month: "short",
							day: "numeric",
							year: "numeric",
							hour: "numeric",
							minute: "2-digit",
						})
					: undefined;
				await emailService.notifyNewPatient(fullName(patient), patient.id, vaEmails, {
					appointment: appointmentStr,
					platform: platformLabel,
				});
			}
		} catch (err) {
			logger.error({ err, patientId: patient.id }, "Failed to send new patient notification emails");
		}

		return ServiceResponse.success("Patient created from webhook intake.", toPatientDto(patient), StatusCodes.CREATED);
	},

	/**
	 * Manual create from the authenticated Add Patient form. Same intake
	 * behavior (first stage, auto-assign) but the patient is created by a
	 * logged-in user — the audit log records WHO added it.
	 */
	async create(input: CreatePatientInput, user: AuthenticatedUser) {
		const appointmentDatetime = input.appointmentDatetime ? new Date(input.appointmentDatetime) : null;
		const firstStage = await getFirstStageKey();

		// No duplicate emails — the Add Patient form must not create a second
		// record for an existing patient.
		if (await findDuplicateByEmail(input.email)) {
			return ServiceResponse.failure(
				"A patient with this email already exists. Use a different email or update the existing patient.",
				null,
				StatusCodes.CONFLICT,
			);
		}

		// Auto-assign VA: explicit selection wins, then appointment time
		const { assignedTo, assignmentMethod } = await resolveAutoAssign(input, appointmentDatetime);

		const patient = await prisma.patient.create({
			data: {
				// firstName/lastName are the source of truth — the Add Patient form
				// sends them separately. A `name` fallback is still accepted and
				// split for any client that sends the old merged field.
				firstName: input.firstName?.trim() || splitName(input.name).firstName,
				lastName: input.lastName?.trim() || splitName(input.name).lastName,
				email: input.email ?? null,
				phone: input.phone ?? null,
				dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
				location: input.location ?? null,
				stage: firstStage,
				appointmentDatetime,
				bookingPlatform: input.bookingPlatform ?? null,
				problemDescription: input.problemDescription ?? null,
				paymentMethod: input.paymentMethod ?? null,
				insuranceProvider: input.insuranceProvider ?? null,
				visitStatus: input.visitStatus ?? undefined,
				source: "manual",
				checklistState: {},
				notes: null,
				assignedTo,
				updatedById: user.id,
				createdById: user.id,
			},
		});

		const assignmentNote = assignedTo ? ` - Assigned via ${assignmentMethod}` : "";
		await audit({
			patientId: patient.id,
			user,
			action: "patient.create",
			entityType: "patient",
			entityId: patient.id,
			newValue: { source: "manual", assignedTo, assignmentMethod },
			message: `Added patient "${fullName(patient)}"${assignmentNote}`,
		});

		// Keep parity with webhook intake: notify the VAs a new patient landed.
		try {
			const vas = await prisma.user.findMany({ where: { role: "va" }, select: { email: true } });
			const vaEmails = vas.map((v) => v.email).filter(Boolean) as string[];
			if (vaEmails.length > 0) {
				const appointmentStr = appointmentDatetime
					? appointmentDatetime.toLocaleDateString("en-US", {
							weekday: "short",
							month: "short",
							day: "numeric",
							year: "numeric",
							hour: "numeric",
							minute: "2-digit",
						})
					: undefined;
				await emailService.notifyNewPatient(fullName(patient), patient.id, vaEmails, {
					appointment: appointmentStr,
					platform: input.bookingPlatform ?? "manual",
				});
			}
		} catch (err) {
			logger.error({ err, patientId: patient.id }, "Failed to send new patient notification emails");
		}

		return ServiceResponse.success("Patient created.", toPatientDto(patient), StatusCodes.CREATED);
	},

	async updateAppointment(id: string, input: UpdateAppointmentInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({
			where: { id },
			include: {
				assignedUser: { select: { id: true, name: true, email: true } },
			},
		});

		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		if (!canEditPatient(patient, user)) {
			return ServiceResponse.failure(
				"This patient is assigned to another VA, or currently locked. Only the assigned VA or an admin can update it.",
				null,
				StatusCodes.FORBIDDEN,
			);
		}

		const newDateTime = new Date(input.appointmentDatetime);
		const oldDateTime = patient.appointmentDatetime;

		// Auto-assign VA based on appointment time if patient not already assigned
		let newAssignedTo = patient.assignedTo;
		if (!patient.assignedTo && newDateTime) {
			const appointmentHour = newDateTime.getHours();
			const vas = await prisma.user.findMany({
				where: { role: "va" },
				select: { id: true, name: true },
			});

			// Find Jude (morning shifts, < 12pm) and Amanda (evening shifts, >= 12pm)
			const jude = vas.find((va) => va.name?.toLowerCase().includes("jude"));
			const amanda = vas.find((va) => va.name?.toLowerCase().includes("amanda"));

			newAssignedTo = appointmentHour < 12 ? (jude?.id ?? null) : (amanda?.id ?? null);
		}

		const updated = await prisma.patient.update({
			where: { id },
			data: {
				appointmentDatetime: newDateTime,
				assignedTo: newAssignedTo,
				updatedAt: new Date(),
				updatedById: user.id,
			},
			include: {
				assignedUser: { select: { id: true, name: true, email: true } },
			},
		});

		const autoAssignmentNote = newAssignedTo && !patient.assignedTo ? ` - Auto-assigned based on appointment time` : "";
		await audit({
			patientId: id,
			user,
			action: "appointment.update",
			category: "appointment",
			entityType: "patient",
			entityId: id,
			prevValue: { appointmentDatetime: oldDateTime, assignedTo: patient.assignedTo },
			newValue: { appointmentDatetime: newDateTime, assignedTo: newAssignedTo },
			message: `Appointment rescheduled to ${newDateTime.toLocaleDateString("en-US")} at ${newDateTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${autoAssignmentNote}`,
		});

		// Send notification emails
		try {
			const admin = await prisma.user.findFirst({
				where: { role: { in: ["admin", "super_admin"] } },
				select: { email: true },
			});
			if (admin?.email && patient.email) {
				await emailService.notifyAppointmentChanged(
					fullName(patient),
					patient.email,
					newDateTime,
					user.name,
					admin.email,
				);
			}
		} catch (err) {
			logger.error({ err, patientId: id }, "Failed to send appointment change notification emails");
			// Don't fail the update if email fails - still return success
		}

		return ServiceResponse.success("Appointment updated and notifications sent.", toPatientDto(updated));
	},
};
