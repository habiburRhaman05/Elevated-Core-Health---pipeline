-- AlterEnum
ALTER TYPE "ActivityCategory" ADD VALUE 'messaging';

-- CreateTable
CREATE TABLE "sms_conversations" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "patient_id" TEXT,
    "quo_contact_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "quo_message_id" TEXT,
    "sent_by_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_conversations_phone_number_key" ON "sms_conversations"("phone_number");

-- CreateIndex
CREATE INDEX "sms_conversations_patient_id_idx" ON "sms_conversations"("patient_id");

-- CreateIndex
CREATE INDEX "sms_conversations_last_message_at_idx" ON "sms_conversations"("last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "sms_messages_quo_message_id_key" ON "sms_messages"("quo_message_id");

-- CreateIndex
CREATE INDEX "sms_messages_conversation_id_idx" ON "sms_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "sms_messages_created_at_idx" ON "sms_messages"("created_at");

-- AddForeignKey
ALTER TABLE "sms_conversations" ADD CONSTRAINT "sms_conversations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "sms_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
