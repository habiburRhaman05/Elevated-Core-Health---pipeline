"use client"

import { useRef, useState } from "react"
import {
  Folder,
  FolderPlus,
  FolderOpen,
  Upload,
  Search,
  FileText,
  FileImage,
  FileVideo,
  File as FileIcon,
  MoreVertical,
  Pencil,
  Trash2,
  Link as LinkIcon,
  Download,
  Loader2,
  ChevronRight,
  Home,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  useFolders,
  useCreateFolder,
  useRenameFolder,
  useDeleteFolder,
  useDocuments,
  useUploadDocument,
  useUpdateDocument,
  useDeleteDocument,
} from "@/hooks/query/useDocuments"
import { useMyPermissions } from "@/hooks/query/usePermissions"
import { useAuth } from "@/hooks/auth/useAuth"
import { isAdminOrAbove } from "@/lib/roles"
import { cn } from "@/lib/utils"
import type { DocumentItem, DocumentResourceType } from "@/types"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function iconForResourceType(type: DocumentResourceType, mimeType: string) {
  if (type === "image") return { Icon: FileImage, color: "text-purple-500", bg: "bg-purple-50" }
  if (type === "video") return { Icon: FileVideo, color: "text-blue-500", bg: "bg-blue-50" }
  if (mimeType === "application/pdf") return { Icon: FileText, color: "text-red-500", bg: "bg-red-50" }
  return { Icon: FileIcon, color: "text-[#6B7280]", bg: "bg-gray-50" }
}

interface BreadcrumbEntry {
  id: string
  name: string
}

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
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderValue, setRenameFolderValue] = useState("")
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null)
  const [renameDocValue, setRenameDocValue] = useState("")
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<{ id: string; name: string } | null>(null)
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<{ id: string; name: string } | null>(null)
  const [folderNonEmptyError, setFolderNonEmptyError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

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
  const updateDocument = useUpdateDocument()
  const deleteDocument = useDeleteDocument()

  const isLoading = foldersLoading || docsLoading

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    await createFolder.mutateAsync({ name: newFolderName.trim(), parentFolderId: currentFolderId ?? null })
    setNewFolderName("")
    setShowNewFolder(false)
  }

  const handleUploadClick = () => fileInputRef.current?.click()

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    await uploadDocument.mutateAsync({ file, folderId: currentFolderId })
  }

  const handleDeleteFolder = async (id: string, force: boolean) => {
    try {
      await deleteFolder.mutateAsync({ id, force })
      setConfirmDeleteFolder(null)
      setFolderNonEmptyError(null)
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setFolderNonEmptyError(err.response.data.message)
      } else {
        setConfirmDeleteFolder(null)
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
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <button
          onClick={() => setPath([])}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#EBF7EC] transition-colors",
            path.length === 0 ? "text-[#036638] font-semibold" : "text-[#6B7280]",
          )}
        >
          <Home className="w-3.5 h-3.5" />
          Documents
        </button>
        {path.map((entry, idx) => (
          <div key={entry.id} className="flex items-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5 text-[#D1D5DB]" />
            <button
              onClick={() => setPath(path.slice(0, idx + 1))}
              className={cn(
                "px-2 py-1 rounded-lg hover:bg-[#EBF7EC] transition-colors truncate max-w-[200px]",
                idx === path.length - 1 ? "text-[#036638] font-semibold" : "text-[#6B7280]",
              )}
            >
              {entry.name}
            </button>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#036638]/30"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as DocumentResourceType | "")}
            className="h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#036638]/30 cursor-pointer"
          >
            <option value="">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="raw">Documents</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)} className="gap-1.5">
              <FolderPlus className="w-4 h-4" />
              New Folder
            </Button>
          )}
          {canUpload && (
            <Button
              size="sm"
              onClick={handleUploadClick}
              disabled={uploadDocument.isPending}
              className="bg-[#036638] hover:bg-[#025030] text-white gap-1.5"
            >
              {uploadDocument.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload
            </Button>
          )}
        </div>
      </div>

      {/* New folder inline form */}
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
            onClick={() => { setShowNewFolder(false); setNewFolderName("") }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-[#6B7280]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#036638] animate-spin" />
        </div>
      ) : (
        <>
          {/* Folders */}
          {folders && folders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="group relative bg-white rounded-xl border border-[#E5E7EB] p-3.5 hover:border-[#65BD6C]/40 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => setPath([...path, { id: folder.id, name: folder.name }])}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-[#EBF7EC] flex items-center justify-center shrink-0">
                      <Folder className="w-5 h-5 text-[#036638]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1A1B1E] truncate">{folder.name}</p>
                      <p className="text-[11px] text-[#6B7280]">
                        {folder._count.documents} file{folder._count.documents !== 1 ? "s" : ""}
                        {folder._count.children > 0 && `, ${folder._count.children} folder${folder._count.children !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => { setRenamingFolderId(folder.id); setRenameFolderValue(folder.name) }}
                        className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] hover:bg-[#EBF7EC] text-[#6B7280] hover:text-[#036638]"
                        title="Rename folder"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteFolder({ id: folder.id, name: folder.name })}
                        className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] hover:bg-red-50 text-[#6B7280] hover:text-red-500"
                        title="Delete folder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Files */}
          {documents && documents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {documents.map((doc) => {
                const { Icon, color, bg } = iconForResourceType(doc.resourceType, doc.mimeType)
                return (
                  <div
                    key={doc.id}
                    className="group relative bg-white rounded-xl border border-[#E5E7EB] p-3.5 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", bg)}>
                        <Icon className={cn("w-5 h-5", color)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#1A1B1E] truncate" title={doc.fileName}>
                          {doc.fileName}
                        </p>
                        <p className="text-[11px] text-[#6B7280]">
                          {formatFileSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                        </p>
                        {doc.patient && (
                          <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                            {doc.patient.name}
                          </span>
                        )}
                        {doc.uploadedBy && (
                          <p className="text-[10px] text-[#9CA3AF] mt-1">by {doc.uploadedBy.name}</p>
                        )}
                      </div>
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)}
                          className="p-1 rounded-lg hover:bg-gray-100 text-[#6B7280]"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenuId === doc.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute right-0 top-8 z-20 w-40 bg-white border border-[#E5E7EB] rounded-xl shadow-lg overflow-hidden py-1">
                              <button
                                onClick={() => handleCopyLink(doc)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
                              >
                                <LinkIcon className="w-3.5 h-3.5" /> Copy link
                              </button>
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => setOpenMenuId(null)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
                              >
                                <Download className="w-3.5 h-3.5" /> Open / Download
                              </a>
                              {canUpload && (
                                <button
                                  onClick={() => {
                                    setRenamingDocId(doc.id)
                                    setRenameDocValue(doc.fileName)
                                    setOpenMenuId(null)
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
                                >
                                  <Pencil className="w-3.5 h-3.5" /> Rename
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => {
                                    setConfirmDeleteDoc({ id: doc.id, name: doc.fileName })
                                    setOpenMenuId(null)
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            (!folders || folders.length === 0) && (
              <div className="text-center py-16">
                <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400 italic">
                  {search || typeFilter ? "No files match your search" : "No files here yet"}
                </p>
              </div>
            )
          )}
        </>
      )}

      {/* Rename folder modal */}
      {renamingFolderId && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" onClick={() => setRenamingFolderId(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-sm font-bold text-[#1A1B1E] mb-3">Rename Folder</h3>
            <input
              autoFocus
              type="text"
              value={renameFolderValue}
              onChange={(e) => setRenameFolderValue(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#036638]/30 mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRenamingFolderId(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!renameFolderValue.trim() || renameFolder.isPending}
                onClick={async () => {
                  await renameFolder.mutateAsync({ id: renamingFolderId, name: renameFolderValue.trim() })
                  setRenamingFolderId(null)
                }}
                className="bg-[#036638] hover:bg-[#025030] text-white"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rename document modal */}
      {renamingDocId && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" onClick={() => setRenamingDocId(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-sm font-bold text-[#1A1B1E] mb-3">Rename Document</h3>
            <input
              autoFocus
              type="text"
              value={renameDocValue}
              onChange={(e) => setRenameDocValue(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#036638]/30 mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRenamingDocId(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!renameDocValue.trim() || updateDocument.isPending}
                onClick={async () => {
                  await updateDocument.mutateAsync({ id: renamingDocId, changes: { fileName: renameDocValue.trim() } })
                  setRenamingDocId(null)
                }}
                className="bg-[#036638] hover:bg-[#025030] text-white"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete folder confirmation */}
      {confirmDeleteFolder && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-lg"
            onClick={() => { setConfirmDeleteFolder(null); setFolderNonEmptyError(null) }}
          />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-sm font-bold text-[#1A1B1E] mb-2">Delete "{confirmDeleteFolder.name}"?</h3>
            {folderNonEmptyError ? (
              <>
                <p className="text-xs text-red-600 mb-4">{folderNonEmptyError}</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setConfirmDeleteFolder(null); setFolderNonEmptyError(null) }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={deleteFolder.isPending}
                    onClick={() => handleDeleteFolder(confirmDeleteFolder.id, true)}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    Delete Everything Inside
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-[#6B7280] mb-4">This cannot be undone.</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteFolder(null)}>Cancel</Button>
                  <Button
                    size="sm"
                    disabled={deleteFolder.isPending}
                    onClick={() => handleDeleteFolder(confirmDeleteFolder.id, false)}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    {deleteFolder.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Delete"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete document confirmation */}
      {confirmDeleteDoc && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
          <div className="absolute inset-0 bg-black/75 backdrop-blur-lg" onClick={() => setConfirmDeleteDoc(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-sm font-bold text-[#1A1B1E] mb-2">Delete "{confirmDeleteDoc.name}"?</h3>
            <p className="text-xs text-[#6B7280] mb-4">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteDoc(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={deleteDocument.isPending}
                onClick={async () => {
                  await deleteDocument.mutateAsync(confirmDeleteDoc.id)
                  setConfirmDeleteDoc(null)
                }}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                {deleteDocument.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
