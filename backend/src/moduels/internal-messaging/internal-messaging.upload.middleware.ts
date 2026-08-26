import multer from "multer";

// Generous but bounded — large enough for a phone photo/short video, small
// enough that a single attachment can't tie up a serverless function's
// memory/time budget. Same memoryStorage pattern as avatar/import uploads
// (avatarUpload, import.middleware.ts) — buffered in RAM, never touches disk,
// then streamed straight to Cloudinary.
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"];
const ALLOWED_DOCUMENT_MIMES = new Set([
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/zip",
	"text/plain",
	"text/csv",
]);

function isAllowedMime(mimetype: string): boolean {
	return ALLOWED_MIME_PREFIXES.some((prefix) => mimetype.startsWith(prefix)) || ALLOWED_DOCUMENT_MIMES.has(mimetype);
}

/** VAs/Admins attaching a file to a Link Internal Board message — one file
 *  per request, matching the upload-then-attach flow (see internal-messaging
 *  .service.ts's uploadAttachment). */
export const internalMessagingUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_FILE_SIZE, files: 1 },
	fileFilter: (_req, file, cb) => {
		if (!isAllowedMime(file.mimetype)) {
			cb(new Error("Unsupported file type. Images, video, audio, and common documents (PDF, Office, ZIP) only."));
			return;
		}
		cb(null, true);
	},
});
