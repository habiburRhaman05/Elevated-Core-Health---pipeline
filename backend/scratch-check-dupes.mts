import { prisma } from "./src/utils/prisma.ts";

const patients = await prisma.patient.findMany({
  where: { source: "grow_therapy" },
  include: { appointmentHistory: true },
  orderBy: { createdAt: "asc" },
});
for (const p of patients) {
  console.log("--- patient", p.id, p.firstName, p.lastName, "| appt:", p.appointmentDatetime, "| externalAppointmentId:", p.externalAppointmentId, "| createdAt:", p.createdAt);
  for (const h of p.appointmentHistory) {
    console.log("    history externalAppointmentId:", h.externalAppointmentId, "| vendorLastModifiedAt:", h.vendorLastModifiedAt, "| appt:", h.appointmentDatetime);
  }
}
await prisma.$disconnect();
