import { v2 as cloudinary } from "cloudinary";
import { env } from "@/utils/envConfig";

export const isCloudinaryConfigured = Boolean(
	env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (isCloudinaryConfigured) {
	cloudinary.config({
		cloud_name: env.CLOUDINARY_CLOUD_NAME,
		api_key: env.CLOUDINARY_API_KEY,
		// The API secret never leaves this process — it's only used here, server-side, to sign
		// the upload request. The client never sees it or any signature derived from it.
		api_secret: env.CLOUDINARY_API_SECRET,
		secure: true,
	});
}

/**
 * Uploads an in-memory image buffer to Cloudinary and returns its secure URL.
 * Only ever called after the caller has already validated mimetype/size — this
 * function assumes a trusted, pre-validated buffer.
 */
export function uploadAvatarBuffer(buffer: Buffer, userId: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder: "ech-pipeline/avatars",
				public_id: userId,
				overwrite: true,
				resource_type: "image",
				transformation: [{ width: 512, height: 512, crop: "fill", gravity: "face" }],
			},
			(error, result) => {
				if (error || !result) {
					reject(error ?? new Error("Cloudinary upload returned no result"));
					return;
				}
				resolve(result.secure_url);
			},
		);
		stream.end(buffer);
	});
}

export interface UploadedAttachment {
	url: string;
	thumbnailUrl: string | null;
	width: number | null;
	height: number | null;
	durationSeconds: number | null;
}

/**
 * Uploads a Link Internal Board message attachment (image/video/audio/generic
 * file). Unlike the fixed-transform avatar upload above, this keeps the
 * original file untouched — chat attachments must round-trip exactly what
 * the sender picked, not a cropped/resized version.
 *
 * `resourceType` mirrors Cloudinary's own three buckets: "image" and "video"
 * (which also covers audio) get real transformation/thumbnail support;
 * anything else (pdf, docx, zip, ...) goes through as "raw".
 */
export function uploadInternalMessageAttachment(
	buffer: Buffer,
	fileName: string,
	resourceType: "image" | "video" | "raw",
): Promise<UploadedAttachment> {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder: "ech-pipeline/internal-board",
				resource_type: resourceType,
				// Cloudinary needs the original extension to serve raw files
				// (pdf/docx/...) with a sane filename/content-type on download.
				filename_override: fileName,
				use_filename: true,
				unique_filename: true,
			},
			(error, result) => {
				if (error || !result) {
					reject(error ?? new Error("Cloudinary upload returned no result"));
					return;
				}
				// Videos get a still-frame thumbnail by swapping the extension for
				// .jpg on the same public_id — a cheap Cloudinary URL transform,
				// no second upload needed.
				const thumbnailUrl =
					resourceType === "video"
						? cloudinary.url(result.public_id, {
								resource_type: "video",
								format: "jpg",
								transformation: [{ width: 400, crop: "limit" }],
							})
						: null;
				resolve({
					url: result.secure_url,
					thumbnailUrl,
					width: result.width ?? null,
					height: result.height ?? null,
					durationSeconds: result.duration ? Math.round(result.duration) : null,
				});
			},
		);
		stream.end(buffer);
	});
}

export interface UploadedDocument {
	url: string;
	publicId: string;
	resourceType: "image" | "video" | "raw";
}

/**
 * Uploads a file to the Document Storage feature. Same "never touch the
 * original bytes" posture as uploadInternalMessageAttachment — a stored
 * business document must round-trip byte-for-byte, so no transformation is
 * applied regardless of resourceType.
 *
 * folderId is nested into the Cloudinary path (not just Postgres) so the
 * asset organization on Cloudinary's own side mirrors the folder tree a
 * user sees in the app — useful for anyone auditing directly in the
 * Cloudinary console. "root" is used for documents with no folderId
 * (the "Uncategorized" view).
 */
export function uploadDocument(
	buffer: Buffer,
	fileName: string,
	resourceType: "image" | "video" | "raw",
	folderId: string | null,
): Promise<UploadedDocument> {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder: `ech-pipeline/documents/${folderId ?? "root"}`,
				resource_type: resourceType,
				filename_override: fileName,
				use_filename: true,
				unique_filename: true,
			},
			(error, result) => {
				if (error || !result) {
					reject(error ?? new Error("Cloudinary upload returned no result"));
					return;
				}
				resolve({ url: result.secure_url, publicId: result.public_id, resourceType });
			},
		);
		stream.end(buffer);
	});
}

/**
 * Deletes the underlying Cloudinary asset for a document. Called BEFORE the
 * DB row is deleted (see documents.service.ts) — if this fails, the row stays
 * so the orphaned asset can be found and cleaned up rather than silently
 * losing track of it. `resourceType` must match what the asset was uploaded
 * with; Cloudinary's destroy() looks in the wrong bucket otherwise and
 * reports a false "not found".
 */
export function deleteDocument(publicId: string, resourceType: "image" | "video" | "raw"): Promise<void> {
	return new Promise((resolve, reject) => {
		cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, (error, result) => {
			if (error) {
				reject(error);
				return;
			}
			// Cloudinary returns { result: "ok" } on success and { result: "not found" }
			// for an id that doesn't exist — treat "not found" as success too, since
			// the end state (asset gone) is identical and this call may be retrying
			// a delete whose Cloudinary side already succeeded but whose DB delete
			// failed.
			if (result?.result !== "ok" && result?.result !== "not found") {
				reject(new Error(`Cloudinary destroy returned unexpected result: ${result?.result}`));
				return;
			}
			resolve();
		});
	});
}
