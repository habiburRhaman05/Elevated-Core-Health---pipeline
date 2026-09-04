"use client"

import { FolderOpen } from "lucide-react"
import { DocumentsManager } from "@/components/features/documents-manager"
import { PageHeader } from "@/components/shared/page-header"

export default function VADocumentsPage() {
  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div className="rounded-2xl border border-[#EDEFF2] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] px-4 py-3.5 sm:px-5">
        <PageHeader
          breadcrumb="Documents"
          title="Document Storage"
          subtitle="Store, organize, and share business and patient documents"
          icon={FolderOpen}
        />
      </div>
      <DocumentsManager />
    </div>
  )
}
