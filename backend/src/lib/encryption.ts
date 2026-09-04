import crypto from "node:crypto";

import { env } from "@/utils/envConfig";

/**
 * AES-256-GCM at-rest encryption for the Password Vault — the only place in
 * this app that stores a real secret a human is expected to actually use
 * later (as opposed to JWT/webhook secrets, which are opaque tokens we
 * generate and never need to display again).
 *
 * GCM is authenticated: `authTag` lets decrypt() detect tampering/corruption
 * instead of silently returning garbage. IV is regenerated per encryption
 * (never reused with the same key), which is why it has to be stored
 * alongside the ciphertext — it isn't a secret itself, just non-reusable.
 */
const ALGORITHM = "aes-256-gcm";

/** env.PASSWORD_VAULT_ENCRYPTION_KEY is a 64-char hex string (32 bytes) — see .env.template. */
function getKey(): Buffer {
	return Buffer.from(env.PASSWORD_VAULT_ENCRYPTION_KEY, "hex");
}

export interface EncryptedSecret {
	cipher: string;
	iv: string;
	authTag: string;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
	const iv = crypto.randomBytes(12); // 96-bit IV is the GCM-recommended size
	const cipherStream = crypto.createCipheriv(ALGORITHM, getKey(), iv);
	const cipher = Buffer.concat([cipherStream.update(plaintext, "utf8"), cipherStream.final()]);
	return {
		cipher: cipher.toString("base64"),
		iv: iv.toString("base64"),
		authTag: cipherStream.getAuthTag().toString("base64"),
	};
}

export function decryptSecret(encrypted: EncryptedSecret): string {
	const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(encrypted.iv, "base64"));
	decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
	const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted.cipher, "base64")), decipher.final()]);
	return plaintext.toString("utf8");
}
