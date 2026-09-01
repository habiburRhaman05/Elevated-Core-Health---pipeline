-- Klarity webhook intake (POST /api/patients/intake/klarity).
-- All columns are nullable: every other intake path (manual, Optimantra
-- webhook, CSV import) leaves them empty.

ALTER TABLE "patients" ADD COLUMN "appointment_end_datetime" TIMESTAMP(3);
ALTER TABLE "patients" ADD COLUMN "external_patient_id" TEXT;
ALTER TABLE "patients" ADD COLUMN "external_appointment_id" TEXT;

-- Klarity may poll and re-send the same appointment; the unique index is what
-- lets intakeKlarity update in place instead of creating a duplicate.
-- Postgres treats NULLs as distinct, so rows from other sources are unaffected.
CREATE UNIQUE INDEX "patients_external_appointment_id_key" ON "patients"("external_appointment_id");
CREATE INDEX "patients_external_patient_id_idx" ON "patients"("external_patient_id");
