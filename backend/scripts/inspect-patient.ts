import { prisma } from "@/utils/prisma";

async function main() {
	const name = process.argv[2] || "test";
	const patients = await prisma.patient.findMany({
		where: { firstName: { contains: name, mode: "insensitive" } },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			status: true,
			source: true,
			bookingPlatform: true,
			externalPatientId: true,
			externalAppointmentId: true,
			appointmentDatetime: true,
			appointmentEndDatetime: true,
			createdAt: true,
			updatedAt: true,
		},
	});
	for (const p of patients) {
		console.log(JSON.stringify(p, null, 2));
		const history = await prisma.appointmentHistory.findMany({ where: { patientId: p.id } });
		console.log(`  -> ${history.length} AppointmentHistory row(s)`);
	}
}

main()
	.catch((e) => console.error(e))
	.finally(() => prisma.$disconnect());
