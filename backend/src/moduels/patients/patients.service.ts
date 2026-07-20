import { StatusCodes } from "http-status-codes";

import { isChecklistComplete } from "@/config/checklists";
import type { AuthenticatedUser } from "@/lib/types";
import { emailService } from "@/services/email.service";
import { logger } from "@/utils/logger";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";
import type {
	AssignInput,
	ChecklistToggleInput,
	ClaimInput,
	FlagInput,
	IntakeInput,
	NotesInput,
	StageMoveInput,
} from "./patients.validation";

const STAGE_ORDER = [
	"onboarding",
	"visit_complete",
	"post_visit_docs",
	"chart_signed",
	"sent_to_billing",
	"payment_posted",
	"reconciled",
] as const;

type Stage = (typeof STAGE_ORDER)[number];

async function logActivity(patientId: string, author: string, message: string, type: "auto" | "manual") {
	try {
		await prisma.activityLog.create({ data: { patientId, author, message, type } });
	} catch (err) {
		logger.error({ err }, "Failed to log activity");
	}
}

export const patientsService = {
	async list(stage?: string) {
		const where = stage ? { stage: stage as Stage } : {};
		const patients = await prisma.patient.findMany({
			where,
			orderBy: { updatedAt: "desc" },
			include: {
				assignedUser: { select: { id: true, name: true } },
				flaggedByUser: { select: { id: true, name: true } },
			},
		});
		return ServiceResponse.success("Patients retrieved.", patients);
	},

	async getById(id: string) {
		const patient = await prisma.patient.findUnique({
			where: { id },
			include: {
				assignedUser: { select: { id: true, name: true } },
				flaggedByUser: { select: { id: true, name: true } },
				activityLogs: { orderBy: { createdAt: "desc" }, take: 50 },
			},
		});
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}
		return ServiceResponse.success("Patient retrieved.", patient);
	},

	async moveStage(id: string, input: StageMoveInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		const curIdx = STAGE_ORDER.indexOf(patient.stage as Stage);
		const tgtIdx = STAGE_ORDER.indexOf(input.targetStage as Stage);

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

		const updated = await prisma.patient.update({
			where: { id },
			data: { stage: input.targetStage as Stage, updatedAt: new Date(), updatedById: user.id },
		});

		await logActivity(id, user.name, `Moved from ${patient.stage} to ${input.targetStage}`, "auto");

		return ServiceResponse.success("Stage updated.", updated);
	},

	async assign(id: string, input: AssignInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		const updated = await prisma.patient.update({
			where: { id },
			data: { assignedTo: input.assignedTo, updatedAt: new Date(), updatedById: user.id },
		});

		await logActivity(id, user.name, `Assigned patient`, "manual");

		return ServiceResponse.success("Assignment updated.", updated);
	},

	async toggleChecklist(id: string, input: ChecklistToggleInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
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
		await logActivity(id, user.name, `Checklist item "${label}" ${action}`, "auto");

		return ServiceResponse.success("Checklist updated.", updated);
	},

	async updateNotes(id: string, input: NotesInput, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		const updated = await prisma.patient.update({
			where: { id },
			data: { notes: input.notes, updatedAt: new Date(), updatedById: user.id },
		});

		await logActivity(
			id,
			user.name,
			`Note updated: "${input.notes.slice(0, 60)}${input.notes.length > 60 ? "..." : ""}"`,
			"manual",
		);

		return ServiceResponse.success("Notes updated.", updated);
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

		await logActivity(id, user.name, `Flagged for Donna: ${input.reason}`, "manual");

		const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { email: true } });
		if (admin) {
			emailService.notifyFlagged(patient.name, user.name, input.reason, admin.email).catch(() => {});
		}

		return ServiceResponse.success("Patient flagged.", updated);
	},

	async clearFlag(id: string, user: AuthenticatedUser) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		const updated = await prisma.patient.update({
			where: { id },
			data: {
				isFlagged: false,
				flagReason: null,
				flaggedById: null,
				flaggedAt: null,
				updatedAt: new Date(),
				updatedById: user.id,
			},
		});

		await logActivity(id, user.name, "Flag cleared", "manual");

		return ServiceResponse.success("Flag cleared.", updated);
	},

	async deletePatient(id: string) {
		const patient = await prisma.patient.findUnique({ where: { id } });
		if (!patient) {
			return ServiceResponse.failure("Patient not found.", null, StatusCodes.NOT_FOUND);
		}

		await prisma.patient.delete({ where: { id } });
		return ServiceResponse.success("Patient deleted.", null);
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

		await logActivity(id, user.name, `Claimed responsibility for patient`, "manual");

		const vas = await prisma.user.findMany({ where: { role: "va" }, select: { id: true, name: true, email: true } });
		const otherVa = vas.find((v) => v.id !== input.userId);
		if (otherVa) {
			emailService.notifyClaimed(patient.name, user.name, otherVa.email).catch(() => {});
		}

		return ServiceResponse.success("Patient claimed.", updated);
	},

	async listChecklistItems() {
		const items = await prisma.checklistItem.findMany({
			orderBy: [{ stage: "asc" as never }, { sortOrder: "asc" }],
			select: { id: true, stage: true, label: true, description: true, isDefault: true, sortOrder: true },
		});
		return ServiceResponse.success("Checklist items retrieved.", items);
	},

	async intake(input: IntakeInput) {
		const appointmentDatetime = input.appointmentDatetime ? new Date(input.appointmentDatetime) : null;

		const patient = await prisma.patient.create({
			data: {
				name: input.name,
				email: input.email ?? null,
				phone: input.phone ?? null,
				stage: "onboarding",
				appointmentDatetime,
				bookingPlatform: input.bookingPlatform ?? null,
				problemDescription: input.problemDescription ?? null,
				source: "webhook",
				checklistState: {},
				notes: null,
			},
		});

		await logActivity(
			patient.id,
			"system",
			input.bookingPlatform
				? `New patient auto-created from booking email (${input.bookingPlatform})`
				: "New patient auto-created from booking email",
			"auto",
		);

		const vas = await prisma.user.findMany({ where: { role: "va" }, select: { name: true, email: true } });
		const jude = vas.find((v) => v.name.toLowerCase() === "jude");
		const amanda = vas.find((v) => v.name.toLowerCase() === "amanda");
		if (jude && amanda) {
			emailService
				.notifyNewPatient(patient.name, patient.id, {
					jude: jude.email,
					amanda: amanda.email,
				})
				.catch(() => {});
		}

		return ServiceResponse.success("Patient created from webhook intake.", patient, StatusCodes.CREATED);
	},
};
