-- AlterTable
ALTER TABLE "internal_conversations" ADD COLUMN     "dm_pair_key" TEXT;

-- AlterTable
ALTER TABLE "internal_messages" ADD COLUMN     "reply_to_id" TEXT;

-- Backfill dm_pair_key for any DM conversations created before this column
-- existed (Phase 1 testing), so the new race-safe lookup-by-pairKey path
-- works for them too, not just conversations created after this migration.
UPDATE "internal_conversations" c
SET "dm_pair_key" = sub.pair_key
FROM (
  SELECT
    p."conversation_id" AS conversation_id,
    string_agg(p."user_id", ':' ORDER BY p."user_id") AS pair_key
  FROM "internal_conversation_participants" p
  GROUP BY p."conversation_id"
) sub
WHERE c.id = sub.conversation_id
  AND c."type" = 'dm'
  AND c."dm_pair_key" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "internal_conversations_dm_pair_key_key" ON "internal_conversations"("dm_pair_key");

-- CreateIndex
CREATE INDEX "internal_messages_reply_to_id_idx" ON "internal_messages"("reply_to_id");

-- AddForeignKey
ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "internal_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
