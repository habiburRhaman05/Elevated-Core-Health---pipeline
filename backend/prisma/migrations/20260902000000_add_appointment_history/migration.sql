-- Appointment history: a patient can now have more than one appointment over
-- time. Previously a second Klarity booking for the same person either
-- overwrote patients.appointment_datetime with no trace of the first, or was
-- rejected as a duplicate. This table is append-only per distinct
-- appointment; patients.appointment_datetime becomes a recomputed
-- "next upcoming appointment" snapshot instead of a value that gets clobbered.

-- 1. Drop the per-patient uniqueness on external_appointment_id — a patient
--    can have many appointments now, so this can no longer be a 1:1 key on
--    the patients table. The column itself is kept as a denormalized
--    "most recent appointment id" for quick lookups.
DROP INDEX IF EXISTS "patients_external_appointment_id_key";

-- 2. New enum for one appointment's lifecycle state.
CREATE TYPE "AppointmentEventStatus" AS ENUM ('scheduled', 'rescheduled', 'canceled', 'no_show', 'completed');

-- 3. New table: one row per distinct appointment (keyed by external_appointment_id
--    when it came from a webhook). All columns nullable/defaulted except the
--    appointment date itself and the FK, so nothing here can block old data —
--    there simply are no rows for any patient created before this migration.
CREATE TABLE "appointment_history" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "appointment_datetime" TIMESTAMP(3) NOT NULL,
    "appointment_end_datetime" TIMESTAMP(3),
    "previous_datetime" TIMESTAMP(3),
    "status" "AppointmentEventStatus" NOT NULL DEFAULT 'scheduled',
    "external_appointment_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'klarity',
    "last_event_type" TEXT,
    "provider_name" TEXT,
    "host_name" TEXT,
    "service_type" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appointment_history_external_appointment_id_key" ON "appointment_history"("external_appointment_id");
CREATE INDEX "appointment_history_patient_id_idx" ON "appointment_history"("patient_id");
CREATE INDEX "appointment_history_appointment_datetime_idx" ON "appointment_history"("appointment_datetime");

ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
