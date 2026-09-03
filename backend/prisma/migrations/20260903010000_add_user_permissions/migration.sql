-- Per-VA, per-action permissions. Pure addition: a new table, no ALTER on any
-- existing table, no foreign key required (userId/updatedById reference the
-- existing "users" table but nothing on "users" is modified). Existing data
-- is untouched.
--
-- No rows are seeded for existing users deliberately — an absent row means
-- "granted" (see UserPermission's doc comment in schema.prisma / the
-- requirePermission middleware), so leaving this table empty on deploy is
-- exactly what preserves every VA's current behavior unchanged.

CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_permissions_user_id_permission_key_key" ON "user_permissions"("user_id", "permission_key");

ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
