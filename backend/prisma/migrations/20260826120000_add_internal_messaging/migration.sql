-- CreateEnum
CREATE TYPE "InternalConversationType" AS ENUM ('dm', 'group');

-- CreateEnum
CREATE TYPE "InternalAttachmentType" AS ENUM ('image', 'video', 'audio', 'file');

-- CreateTable
CREATE TABLE "internal_conversations" (
    "id" TEXT NOT NULL,
    "type" "InternalConversationType" NOT NULL DEFAULT 'dm',
    "name" TEXT,
    "avatar_url" TEXT,
    "created_by" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_conversation_participants" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "type" "InternalAttachmentType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internal_conversations_last_message_at_idx" ON "internal_conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "internal_conversation_participants_user_id_idx" ON "internal_conversation_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "internal_conversation_participants_conversation_id_user_id_key" ON "internal_conversation_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "internal_messages_conversation_id_created_at_idx" ON "internal_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "internal_messages_sender_id_idx" ON "internal_messages"("sender_id");

-- CreateIndex
CREATE INDEX "internal_attachments_message_id_idx" ON "internal_attachments"("message_id");

-- AddForeignKey
ALTER TABLE "internal_conversations" ADD CONSTRAINT "internal_conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_conversation_participants" ADD CONSTRAINT "internal_conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "internal_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_conversation_participants" ADD CONSTRAINT "internal_conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "internal_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_attachments" ADD CONSTRAINT "internal_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "internal_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

