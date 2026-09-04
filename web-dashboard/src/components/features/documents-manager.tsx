"use client"

import { useState } from "react"
import { FolderOpen, FolderPlus, Loader2, MousePointerClick, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  useFolders,
  useCreateFolder,
  useRenameFolder,
  useDeleteFolder,
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
} from "@/hooks/query/useDocuments"
import { useMyPermissions } from "@/hooks/query/usePermissions"
import { useAuth } from "@/hooks/auth/useAuth"
import { isAdminOrAbove } from "@/lib/roles"
import type { DocumentFolder, DocumentItem, DocumentResourceType } from "@/types"

import { DocumentsBreadcrumb } from "./documents/documents-breadcrumb"
import { DocumentsToolbar } from "./documents/documents-toolbar"
import { DocumentDropzone } from "./documents/document-dropzone"
import { UploadModal } from "./documents/upload-modal"
import { PreviewModal } from "./documents/preview-modal"
import { UploadQueue } from "./documents/upload-queue"
import { FolderGrid } from "./documents/folder-grid"
import { DocumentGrid } from "./documents/document-grid"
import { RenameModal } from "./documents/rename-modal"
import { DeleteConfirmModal } from "./documents/delete-confirm-modal"
import { sortDocuments, sortFolders } from "./documents/utils"
import type { BreadcrumbEntry, SortOption, UploadQueueItem } from "./documents/types"

export function DocumentsManager() {
  const { user } = useAuth()
  const isAdmin = isAdminOrAbove(user?.role)
  const { data: myPermissions } = useMyPermissions()
  const canUpload = myPermissions?.["patient.documents.upload"] ?? true
  const canDelete = myPermissions?.["patient.documents.delete"] ?? true

  const [path, setPath] = useState<BreadcrumbEntry[]>([])
  const currentFolderId = path.length > 0 ? path[path.length - 1].id : undefined

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<DocumentResourceType | "">("")
  const [sortBy, setSortBy] = useState<SortOption>("date_new")

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [renamingFolder, setRenamingFolder] = useState<DocumentFolder | null>(null)
  const [deletingFolder, setDeletingFolder] = useState<DocumentFolder | null>(null)
  const [deletingDoc, setDeletingDoc] = useState<DocumentItem | null>(null)
  const [folderNonEmptyError, setFolderNonEmptyError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null)

  const { data: folders, isLoading: foldersLoading } = useFolders(currentFolderId)
  const { data: documents, isLoading: docsLoading } = useDocuments({
    folderId: currentFolderId,
    search: search.trim() || undefined,
    type: typeFilter || undefined,
  })

  const createFolder = useCreateFolder()
  const renameFolder = useRenameFolder()
  const deleteFolder = useDeleteFolder()
  const uploadDocument = useUploadDocument()
  const deleteDocument = useDeleteDocument()

  const isLoading = foldersLoading || docsLoading
  const isUploading = uploadQueue.some((i) => i.status === "uploading")

  const sortedFolders = folders ? sortFolders(folders, sortBy) : []
  const sortedDocuments = documents ? sortDocuments(documents, sortBy) : []

  // ---- Upload — shared by the full-page dropzone and the Upload-button modal ----
  const uploadFiles = (files: File[]) => {
    if (files.length === 0) return
    const queued: UploadQueueItem[] = files.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileName: f.name,
      status: "uploading",
    }))
    setUploadQueue((prev) => [...queued, ...prev])

    files.forEach((file, idx) => {
      const queueId = queued[idx].id
      uploadDocument.mutateAsync({ file, folderId: currentFolderId }).then(
        () => setUploadQueue((prev) => prev.map((i) => (i.id === queueId ? { ...i, status: "done" } : i))),
        (err) =>
          setUploadQueue((prev) =>
            prev.map((i) =>
              i.id === queueId
                ? { ...i, status: "error", error: err?.response?.data?.message || "Upload failed" }
                : i,
            ),
          ),
      )
    })
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    await createFolder.mutateAsync({ name: newFolderName.trim(), parentFolderId: currentFolderId ?? null })
    setNewFolderName("")
    setShowNewFolder(false)
  }

  const handleDeleteFolder = async (force?: boolean) => {
    if (!deletingFolder) return
    try {
      await deleteFolder.mutateAsync({ id: deletingFolder.id, force })
      setDeletingFolder(null)
      setFolderNonEmptyError(null)
    } catch (err: unknown) {
      const apiErr = err as { response?: { status?: number; data?: { message?: string } } }
      if (apiErr?.response?.status === 409) {
        setFolderNonEmptyError(apiErr.response.data?.message ?? "Folder is not empty.")
      } else {
        setDeletingFolder(null)
      }
    }
  }

  const handleCopyLink = async (doc: DocumentItem) => {
    try {
      await navigator.clipboard.writeText(doc.url)
      toast.success("Link copied to clipboard")
    } catch {
      toast.error("Could not copy link")
    }
    setOpenMenuId(null)
  }

  return (
    <div className="space-y-4">
      <DocumentsBreadcrumb path={path} onNavigate={setPath} />

      <DocumentsToolbar
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        isAdmin={isAdmin}
        canUpload={canUpload}
        isUploading={isUploading}
        onNewFolderClick={() => setShowNewFolder(true)}
        onUploadClick={() => setUploadModalOpen(true)}
      />

      {showNewFolder && (
        <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-[#E5E7EB]">
          <FolderPlus className="w-4 h-4 text-[#036638] shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            className="flex-1 h-8 px-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#036638]/30"
          />
          <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim() || createFolder.isPending}>
            Create
          </Button>
          <button
            onClick={() => {
              setShowNewFolder(false)
              setNewFolderName("")
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-[#6B7280]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Whole-page drop target — dragging a file anywhere below this point
          uploads it straight away. Clicking this area does nothing on
          purpose; the Upload button above is the only way to open the
          browse/drag dialog deliberately. */}
      <DocumentDropzone disabled={!canUpload} onFilesDropped={uploadFiles}>
        <div className="space-y-4 min-h-[200px]">
          {canUpload && (
            <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF]">
              <MousePointerClick className="w-3.5 h-3.5" />
              Drag &amp; drop files anywhere on this page to upload
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-[#036638] animate-spin" />
            </div>
          ) : (
            <>
              <FolderGrid
                folders={sortedFolders}
                isAdmin={isAdmin}
                onOpen={(entry) => setPath([...path, entry])}
                onRename={setRenamingFolder}
                onDeleteRequest={setDeletingFolder}
              />

              <DocumentGrid
                documents={sortedDocuments}
                canDelete={canDelete}
                openMenuId={openMenuId}
                onToggleMenu={(id) => setOpenMenuId(openMenuId === id ? null : id)}
                onCloseMenu={() => setOpenMenuId(null)}
                onCopyLink={handleCopyLink}
                onDeleteRequest={(doc) => {
                  setDeletingDoc(doc)
                  setOpenMenuId(null)
                }}
                onPreview={setPreviewDoc}
              />

              {sortedFolders.length === 0 && sortedDocuments.length === 0 && (
                <div className="text-center py-16">
                  <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 italic">
                    {search || typeFilter ? "No files match your search" : "No files here yet — drag files in to upload"}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </DocumentDropzone>

      <UploadModal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} onUpload={uploadFiles} />

      <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />

      <UploadQueue items={uploadQueue} onDismiss={() => setUploadQueue([])} />

      <RenameModal
        key={renamingFolder?.id ?? "no-folder"}
        open={!!renamingFolder}
        title="Rename Folder"
        initialValue={renamingFolder?.name ?? ""}
        isSaving={renameFolder.isPending}
        onCancel={() => setRenamingFolder(null)}
        onSave={async (name) => {
          if (!renamingFolder) return
          await renameFolder.mutateAsync({ id: renamingFolder.id, name })
          setRenamingFolder(null)
        }}
      />

      <DeleteConfirmModal
        open={!!deletingFolder}
        title={deletingFolder?.name ?? ""}
        isDeleting={deleteFolder.isPending}
        nonEmptyError={folderNonEmptyError}
        onCancel={() => {
          setDeletingFolder(null)
          setFolderNonEmptyError(null)
        }}
        onConfirm={(force) => handleDeleteFolder(force)}
      />

      <DeleteConfirmModal
        open={!!deletingDoc}
        title={deletingDoc?.fileName ?? ""}
        isDeleting={deleteDocument.isPending}
        onCancel={() => setDeletingDoc(null)}
        onConfirm={async () => {
          if (!deletingDoc) return
          await deleteDocument.mutateAsync(deletingDoc.id)
          setDeletingDoc(null)
        }}
      />
    </div>
  )
}
