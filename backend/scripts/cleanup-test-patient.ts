import { prisma } from "@/utils/prisma";

async function main() {
	const id = process.argv[2];
	if (!id) {
		console.log("usage: npx tsx scripts/cleanup-test-patient.ts <patientId>");
		return;
	}
	await prisma.activityLog.deleteMany({ where: { patientId: id } });
	const d = await prisma.patient.deleteMany({ where: { id } });
	console.log(`deleted ${d.count} patient(s)`);
}

main()
	.catch((e) => console.error(e))
	.finally(() => prisma.$disconnect());
