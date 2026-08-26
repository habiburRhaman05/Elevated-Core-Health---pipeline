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
