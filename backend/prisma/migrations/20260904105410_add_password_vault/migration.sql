
-- CreateTable
CREATE TABLE "password_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_entries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "secret_cipher" TEXT NOT NULL,
    "secret_iv" TEXT NOT NULL,
    "secret_auth_tag" TEXT NOT NULL,
    "notes" TEXT,
    "group_id" TEXT,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_group_access" (
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "password_group_access_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "password_entry_access" (
    "entry_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "password_entry_access_pkey" PRIMARY KEY ("entry_id","user_id")
);

-- CreateIndex
CREATE INDEX "password_entries_group_id_idx" ON "password_entries"("group_id");

-- AddForeignKey
ALTER TABLE "password_groups" ADD CONSTRAINT "password_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_entries" ADD CONSTRAINT "password_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "password_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_entries" ADD CONSTRAINT "password_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_entries" ADD CONSTRAINT "password_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_group_access" ADD CONSTRAINT "password_group_access_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "password_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_group_access" ADD CONSTRAINT "password_group_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_entry_access" ADD CONSTRAINT "password_entry_access_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "password_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_entry_access" ADD CONSTRAINT "password_entry_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

