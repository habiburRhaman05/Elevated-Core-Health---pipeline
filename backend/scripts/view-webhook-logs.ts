/**
 * Quick CLI viewer for the webhook_logs table — how to actually "see the
 * data" from webhookLogger.ts without a dedicated admin UI page.
 *
 * Usage:
 *   npx tsx scripts/view-webhook-logs.ts                    # last 20, any source
 *   npx tsx scripts/view-webhook-logs.ts klarity             # last 20, klarity only
 *   npx tsx scripts/view-webhook-logs.ts optimantra 50       # last 50, optimantra only
 */
import { prisma } from "@/utils/prisma";

async function main() {
	const source = process.argv[2];
	const limit = Number(process.argv[3]) || 20;

	const rows = await prisma.webhookLog.findMany({
		where: source ? { source } : undefined,
		orderBy: { createdAt: "desc" },
		take: limit,
	});

	if (rows.length === 0) {
		console.log("No webhook log rows found" + (source ? ` for source "${source}"` : "") + ".");
		return;
	}

	for (const r of rows) {
		const when = r.createdAt.toISOString();
		const label = r.direction === "request" ? "REQUEST " : "RESPONSE";
		const status = r.statusCode ? ` [${r.statusCode}]` : "";
		console.log(`\n${when}  ${r.source.toUpperCase()}  ${label}${status}  ${r.method} ${r.path}`);
		console.log(JSON.stringify(r.payload, null, 2));
	}
	console.log(`\n(${rows.length} row(s) shown)`);
}

main().finally(() => prisma.$disconnect());
