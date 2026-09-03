/**
 * Fixed, curated catalog of per-VA permission keys — not admin-authorable.
 * Donna toggles these per INDIVIDUAL VA (Jude vs. Amanda can differ); she
 * can't invent new ones through the UI. Add a new key here (and gate the
 * matching route with `requirePermission`) when a new action needs this
 * granularity — no migration needed since `UserPermission.permissionKey` is
 * a plain string, not an enum.
 *
 * DISTINCT FROM @/config/permissions.ts: that file is a ROLE-level matrix
 * (super_admin/admin/va) — the same for every VA, transcribed from task.md
 * §17, and not yet wired to any route. This file is a PER-USER layer under
 * the "va" role — the same role, different individuals can be granted
 * different things. The two are complementary, not overlapping: a route can
 * check role eligibility via `can()` from that file AND per-user grant via
 * `hasPermission()` here.
 *
 * Grouped for the permission-vault UI, which renders one card per group.
 */
export const VA_PERMISSION_KEYS = [
	"patient.stage.update",
	"patient.info.update",
	"patient.checklist.update",
	"patient.appointment.update",
	"patient.notes.manage",
	"patient.flag.raise",
	"patient.documents.upload",
	"patient.documents.delete",
] as const;

export type VaPermissionKey = (typeof VA_PERMISSION_KEYS)[number];

export function isVaPermissionKey(value: string): value is VaPermissionKey {
	return (VA_PERMISSION_KEYS as readonly string[]).includes(value);
}

interface VaPermissionMeta {
	key: VaPermissionKey;
	label: string;
	description: string;
	group: "Pipeline" | "Notes & Flags" | "Documents";
}

/** Drives the permission-vault UI — labels/descriptions a non-technical admin reads, not a developer. */
export const VA_PERMISSION_CATALOG: VaPermissionMeta[] = [
	{
		key: "patient.stage.update",
		label: "Move pipeline stage",
		description: "Move a patient card forward or backward through the 7-stage pipeline.",
		group: "Pipeline",
	},
	{
		key: "patient.info.update",
		label: "Edit patient info",
		description: "Edit contact details, payment method, and insurance information.",
		group: "Pipeline",
	},
	{
		key: "patient.checklist.update",
		label: "Update checklist",
		description: "Check or uncheck required/optional checklist items on a stage.",
		group: "Pipeline",
	},
	{
		key: "patient.appointment.update",
		label: "Edit appointment date",
		description: "Set or change a patient's appointment date and time.",
		group: "Pipeline",
	},
	{
		key: "patient.notes.manage",
		label: "Manage notes",
		description: "Add or delete operational notes on a patient.",
		group: "Notes & Flags",
	},
	{
		key: "patient.flag.raise",
		label: "Raise a flag",
		description: "Flag a patient for Donna's review.",
		group: "Notes & Flags",
	},
	{
		key: "patient.documents.upload",
		label: "Upload documents",
		description: "Upload a document attached to a patient's record.",
		group: "Documents",
	},
	{
		key: "patient.documents.delete",
		label: "Delete documents",
		description: "Delete a document attached to a patient's record.",
		group: "Documents",
	},
];
