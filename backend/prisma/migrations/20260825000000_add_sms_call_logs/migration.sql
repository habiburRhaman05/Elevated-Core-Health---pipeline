-- CreateTable
CREATE TABLE "sms_call_logs" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "quo_call_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sms_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_call_logs_quo_call_id_key" ON "sms_call_logs"("quo_call_id");

-- CreateIndex
CREATE INDEX "sms_call_logs_conversation_id_idx" ON "sms_call_logs"("conversation_id");

-- CreateIndex
CREATE INDEX "sms_call_logs_created_at_idx" ON "sms_call_logs"("created_at");

-- AddForeignKey
ALTER TABLE "sms_call_logs" ADD CONSTRAINT "sms_call_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "sms_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
