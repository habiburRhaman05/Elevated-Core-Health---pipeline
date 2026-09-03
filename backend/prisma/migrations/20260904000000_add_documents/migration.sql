-- Document storage (Feature 2). Pure addition: two new tables, no ALTER on
-- any existing table. Existing data is untouched.
--
-- document_folders is self-referencing (parent_folder_id -> document_folders.id)
-- for nested folders; onDelete CASCADE there means deleting a folder cascades
-- to its subfolders AND its documents. The service layer still blocks
-- deleting a non-empty folder by default — this cascade only fires on the
-- explicit "delete folder and everything in it" confirmation path.
--
-- documents.folder_id / patient_id are both nullable and SET NULL on delete:
-- a document is never silently destroyed just because its folder or linked
-- patient was removed — it falls back to "Uncategorized" / unlinked instead.

CREATE TABLE "document_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_folder_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT,
    "patient_id" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "cloudinary_public_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_folders_parent_folder_id_idx" ON "document_folders"("parent_folder_id");
CREATE INDEX "documents_folder_id_idx" ON "documents"("folder_id");
CREATE INDEX "documents_patient_id_idx" ON "documents"("patient_id");

ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parent_folder_id_fkey"
    FOREIGN KEY ("parent_folder_id") REFERENCES "document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_fkey"
    FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
