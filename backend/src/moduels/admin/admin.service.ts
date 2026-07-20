import { StatusCodes } from "http-status-codes";
import type { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/utils/prisma";
import { ServiceResponse } from "@/utils/serviceResponse";
import type { ChecklistItemSchema, CreateUserSchema, UpdateUserSchema } from "./admin.validation";

type CreateUserInput = z.infer<typeof CreateUserSchema>["body"];
type UpdateUserInput = z.infer<typeof UpdateUserSchema>["body"];
type ChecklistItemInput = z.infer<typeof ChecklistItemSchema>["body"];

const STAGE_ORDER = [
	"onboarding",
	"visit_complete",
	"post_visit_docs",
	"chart_signed",
	"sent_to_billing",
	"payment_posted",
	"reconciled",
] as const;

export const adminService = {
	// User management
	async listUsers() {
		const users = await prisma.user.findMany({
			select: { id: true, name: true, email: true, role: true, shift: true, createdAt: true },
			orderBy: { createdAt: "asc" },
		});
		return ServiceResponse.success("Users retrieved.", users);
	},

	async createUser(input: CreateUserInput) {
		const existing = await prisma.user.findUnique({ where: { email: input.email } });
		if (existing) {
			return ServiceResponse.failure("A user with this email already exists.", null, StatusCodes.CONFLICT);
		}

		const passwordHash = await hashPassword(input.password);
		const user = await prisma.user.create({
			data: {
				name: input.name,
				email: input.email,
				passwordHash,
				role: input.role,
				shift: input.shift ?? null,
			},
			select: { id: true, name: true, email: true, role: true, shift: true, createdAt: true },
		});

		return ServiceResponse.success("User created.", user, StatusCodes.CREATED);
	},

	async updateUser(id: string, input: UpdateUserInput) {
		const existing = await prisma.user.findUnique({ where: { id } });
		if (!existing) {
			return ServiceResponse.failure("User not found.", null, StatusCodes.NOT_FOUND);
		}

		const data: Record<string, unknown> = {};
		if (input.name !== undefined) data.name = input.name;
		if (input.email !== undefined) data.email = input.email;
		if (input.role !== undefined) data.role = input.role;
		if (input.shift !== undefined) data.shift = input.shift;
		if (input.password !== undefined) {
			data.passwordHash = await hashPassword(input.password);
		}

		const user = await prisma.user.update({
			where: { id },
			data,
			select: { id: true, name: true, email: true, role: true, shift: true, createdAt: true },
		});

		return ServiceResponse.success("User updated.", user);
	},

	async deleteUser(id: string) {
		const existing = await prisma.user.findUnique({ where: { id } });
		if (!existing) {
			return ServiceResponse.failure("User not found.", null, StatusCodes.NOT_FOUND);
		}

		await prisma.user.delete({ where: { id } });
		return ServiceResponse.success("User deleted.", null);
	},

	// Checklist management
	async createChecklistItem(input: ChecklistItemInput) {
		const item = await prisma.checklistItem.create({
			data: {
				stage: input.stage as never,
				label: input.label,
				sortOrder: input.sortOrder,
				isDefault: false,
			},
		});
		return ServiceResponse.success("Checklist item created.", item, StatusCodes.CREATED);
	},

	async listChecklistItems() {
		const items = await prisma.checklistItem.findMany({
			orderBy: [{ stage: "asc" }, { sortOrder: "asc" }],
		});
		return ServiceResponse.success("Checklist items retrieved.", items);
	},

	async deleteChecklistItem(id: string) {
		const item = await prisma.checklistItem.findUnique({ where: { id } });
		if (!item) {
			return ServiceResponse.failure("Checklist item not found.", null, StatusCodes.NOT_FOUND);
		}
		if (item.isDefault) {
			return ServiceResponse.failure("Cannot delete default checklist items.", null, StatusCodes.BAD_REQUEST);
		}
		await prisma.checklistItem.delete({ where: { id } });
		return ServiceResponse.success("Checklist item deleted.", null);
	},

	// Analytics
	async getAnalytics() {
		const allPatients = await prisma.patient.findMany({
			select: { stage: true, createdAt: true, updatedAt: true },
		});

		const perStage: Record<string, number> = {};
		for (const p of allPatients) {
			perStage[p.stage] = (perStage[p.stage] || 0) + 1;
		}

		const perVa = await prisma.user.findMany({
			where: { role: "va" },
			select: {
				id: true,
				name: true,
				_count: { select: { assignedPatients: true } },
			},
		});

		const vaLoad = perVa.map((u) => ({ id: u.id, name: u.name, patientCount: u._count.assignedPatients }));

		const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const reconciledThisWeek = await prisma.activityLog.count({
			where: {
				message: { contains: "reconciled" },
				createdAt: { gte: oneWeekAgo },
			},
		});

		return ServiceResponse.success("Analytics retrieved.", {
			patientsPerStage: perStage,
			vaLoad,
			reconciledThisWeek,
		});
	},
};
