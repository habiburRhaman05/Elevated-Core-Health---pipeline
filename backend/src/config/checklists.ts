import { prisma } from "@/utils/prisma";

export interface ChecklistItemDef {
	id: string;
	label: string;
	description: string | null;
	isDefault: boolean;
	sortOrder: number;
}

export async function getChecklistItemsForStage(stage: string): Promise<ChecklistItemDef[]> {
	const items = await prisma.checklistItem.findMany({
		where: { stage: stage as never },
		orderBy: { sortOrder: "asc" },
		select: { id: true, label: true, description: true, isDefault: true, sortOrder: true },
	});
	return items;
}

export async function isChecklistComplete(stage: string, checklistState: Record<string, boolean>): Promise<boolean> {
	const items = await getChecklistItemsForStage(stage);
	if (items.length === 0) return true;
	return items.every((item) => checklistState[item.id] === true);
}
