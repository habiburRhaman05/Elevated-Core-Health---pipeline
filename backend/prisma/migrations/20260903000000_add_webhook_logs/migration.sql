-- Durable webhook payload log, replacing the file-based logger (Vercel's
-- serverless filesystem is ephemeral/read-only outside /tmp and not shared
-- across invocations — a file written during one request would not survive
-- to the next, let alone across a redeploy).
--
-- Pure addition: a brand-new table, no ALTER on any existing table, no
-- foreign key to any existing table. Existing data is untouched.

CREATE TYPE "WebhookLogDirection" AS ENUM ('request', 'response');

CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "direction" "WebhookLogDirection" NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ip" TEXT,
    "status_code" INTEGER,
    "duration_ms" INTEGER,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_logs_source_idx" ON "webhook_logs"("source");
CREATE INDEX "webhook_logs_created_at_idx" ON "webhook_logs"("created_at");
