import multer from "multer";

// Same posture as internalMessagingUpload: buffered in RAM (memoryStorage),
// never touches disk, then streamed straight to Cloudinary. Bounded high
// enough for a scanned multi-page PDF, low enough not to tie up a serverless
// function's memory/time budget on one request.
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const ALLOWED_MIME_PREFIXES = ["image/", "video/"];
const ALLOWED_DOCUMENT_MIMES = new Set([
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/zip",
	"text/plain",
	"text/csv",
]);

function isAllowedMime(mimetype: string): boolean {
	return ALLOWED_MIME_PREFIXES.some((prefix) => mimetype.startsWith(prefix)) || ALLOWED_DOCUMENT_MIMES.has(mimetype);
}

/** Maps a mimetype to the Cloudinary resource_type bucket it uploads as. */
export function resourceTypeForMime(mimetype: string): "image" | "video" | "raw" {
	if (mimetype.startsWith("image/")) return "image";
	if (mimetype.startsWith("video/")) return "video";
	return "raw";
}

export const documentUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_FILE_SIZE, files: 1 },
	fileFilter: (_req, file, cb) => {
		if (!isAllowedMime(file.mimetype)) {
			cb(new Error("Unsupported file type. Images, video, and common documents (PDF, Office, ZIP, text) only."));
			return;
		}
		cb(null, true);
	},
});
