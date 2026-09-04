import { Router } from "express";

import { requireAuth, requireRole } from "@/middlewares/auth";
import { requireVaPermission } from "@/middlewares/vaPermissions";
import { validateRequest } from "@/utils/httpHandlers";
import { documentsController } from "./documents.controller";
import { documentUpload } from "./documents.upload.middleware";
import {
	CreateFolderSchema,
	ListDocumentsSchema,
	ListFoldersSchema,
	RenameFolderSchema,
	UpdateDocumentSchema,
	UploadDocumentSchema,
} from "./documents.validation";

export const documentsRouter: Router = Router();

documentsRouter.use(requireAuth);

// Folder management is admin-only by default — VAs upload INTO existing
// folders (gated by patient.documents.upload below) but don't restructure
// the tree, same tier as Stage Settings/Users/CRM.
documentsRouter.get("/folders", validateRequest(ListFoldersSchema), documentsController.listFolders);
documentsRouter.post(
	"/folders",
	requireRole("admin"),
	validateRequest(CreateFolderSchema),
	documentsController.createFolder,
);
documentsRouter.patch(
	"/folders/:id",
	requireRole("admin"),
	validateRequest(RenameFolderSchema),
	documentsController.renameFolder,
);
documentsRouter.delete("/folders/:id", requireRole("admin"), documentsController.deleteFolder);

documentsRouter.get("/", validateRequest(ListDocumentsSchema), documentsController.list);

documentsRouter.post(
	"/upload",
	requireVaPermission("patient.documents.upload"),
	(req, res, next) => {
		documentUpload.single("file")(req, res, (err) => {
			if (err) {
				const message = err instanceof Error ? err.message : "Upload failed.";
				res.status(400).json({ success: false, message, data: null, statusCode: 400 });
				return;
			}
			next();
		});
	},
	validateRequest(UploadDocumentSchema),
	documentsController.upload,
);

documentsRouter.patch("/:id", validateRequest(UpdateDocumentSchema), documentsController.update);
documentsRouter.delete("/:id", requireVaPermission("patient.documents.delete"), documentsController.delete);
