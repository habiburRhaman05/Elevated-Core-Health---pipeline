-- AlterTable
ALTER TABLE "sms_conversations" ADD COLUMN     "quo_phone_number_id" TEXT;

-- CreateIndex
CREATE INDEX "sms_conversations_quo_phone_number_id_idx" ON "sms_conversations"("quo_phone_number_id");
