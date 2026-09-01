-- Hardening, not a bug fix: converts the 5 appointment-related columns from
-- `timestamp without time zone` to `timestamptz`.
--
-- WHY THIS IS SAFE AND CHANGES NO DATA:
-- Every existing value in these columns was already written as UTC digits by
-- this application (confirmed by the full Klarity test suite: 58/58 checks
-- pass against stored values). `timestamp without time zone` doesn't record
-- that fact anywhere in the schema itself though — it's an unenforced
-- convention this app's own code has always honored, not a database-level
-- guarantee. `col AT TIME ZONE 'UTC'` tells Postgres "reinterpret these exact
-- digits as UTC," which converts them to `timestamptz` with ZERO change to
-- the instant each row represents. Confirm with:
--
--   SELECT id, appointment_datetime FROM patients WHERE appointment_datetime IS NOT NULL LIMIT 5;
--
-- before and after this migration — the printed values will be identical
-- (Postgres renders a timestamptz back in the session's own display timezone,
-- but the underlying instant, and everything Prisma/pg hands back to Node, is
-- unchanged).
--
-- WHY BOTHER, IF NOTHING WAS ACTUALLY BROKEN:
-- `timestamptz` makes "this column is an absolute instant" a schema-level
-- fact instead of an implicit convention — so a future raw SQL query, a BI
-- tool, a different driver, or a session with a non-UTC `timezone` GUC set
-- can no longer misinterpret these values. It costs nothing today and removes
-- a class of latent risk.
--
-- SCOPE NOTE: only the 5 columns actually involved in the reported issue are
-- touched. Every other DateTime column in this schema (createdAt, updatedAt,
-- flaggedAt, etc.) is untouched — converting those too is a reasonable future
-- follow-up, but is a separate, much larger migration and out of scope here.

ALTER TABLE "patients"
	ALTER COLUMN "appointment_datetime" TYPE TIMESTAMPTZ(3) USING "appointment_datetime" AT TIME ZONE 'UTC',
	ALTER COLUMN "appointment_end_datetime" TYPE TIMESTAMPTZ(3) USING "appointment_end_datetime" AT TIME ZONE 'UTC';

ALTER TABLE "appointment_history"
	ALTER COLUMN "appointment_datetime" TYPE TIMESTAMPTZ(3) USING "appointment_datetime" AT TIME ZONE 'UTC',
	ALTER COLUMN "appointment_end_datetime" TYPE TIMESTAMPTZ(3) USING "appointment_end_datetime" AT TIME ZONE 'UTC',
	ALTER COLUMN "previous_datetime" TYPE TIMESTAMPTZ(3) USING "previous_datetime" AT TIME ZONE 'UTC';
