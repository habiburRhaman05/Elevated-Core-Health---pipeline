import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const emptyToUndefined = (schema: z.ZodTypeAny) =>
	z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema);

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	HOST: z.string().min(1).default("localhost"),

	PORT: z.coerce.number().int().positive().default(8080),

	CORS_ORIGIN: z.string().url().default("http://localhost:5173"),

	COMMON_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(1000),

	COMMON_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(1000),

	DATABASE_URL: z.string().url(),

	JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),

	JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),

	WEBHOOK_SECRET: z.string().min(16, "WEBHOOK_SECRET must be at least 16 characters"),

	// Password Vault at-rest encryption key — exactly 32 bytes, hex-encoded (64
	// hex chars). Generate with: openssl rand -hex 32. Rotating this makes every
	// previously-encrypted password unreadable, so treat it like a database
	// credential: back it up, never commit it, same value across restarts.
	PASSWORD_VAULT_ENCRYPTION_KEY: z
		.string()
		.regex(
			/^[0-9a-fA-F]{64}$/,
			"PASSWORD_VAULT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) — generate with: openssl rand -hex 32",
		),

	// Klarity pushes appointments to POST /api/patients/intake/klarity and
	// authenticates with a static bearer token. The default below is the value
	// Klarity is configured with today; override per-environment to rotate it.
	// Compared against the full Authorization header, so it includes "Bearer ".
	KLARITY_WEBHOOK_TOKEN: z.string().min(1).default("Bearer wwre2543tetewr3543r4werwer634266"),

	// Grow Therapy's private Google Calendar .ics export ("Secret address in
	// iCal format"). Optional — same "not configured" pattern as
	// RESEND_API_KEY/CLOUDINARY_* below — so the sync route/cron just reports
	// a clear error instead of crashing the app when this hasn't been set yet.
	// Currently a personal test calendar; swapping in the client's real Grow
	// Therapy calendar is a config change only, no code change.
	GROW_THERAPY_ICS_URL: emptyToUndefined(z.string().url().optional()),

	// Guards GET/POST /api/patients/intake/grow-therapy in production — Vercel
	// Cron automatically sends `Authorization: Bearer <CRON_SECRET>` on every
	// scheduled invocation when this env var is set (see vercel.json). Left
	// unset in development, where the route isn't the trigger path at all
	// (the dev node-cron loop in src/index.ts calls the sync function
	// in-process) — see requireCronSecret's own doc comment.
	CRON_SECRET: emptyToUndefined(z.string().min(16).optional()),

	// Groq (AI name-extraction fallback for the Grow Therapy .ics sync) —
	// optional; without it the sync simply falls back to the patient's title
	// initials when no explicit "Patient:/Client Name:" label is in the
	// description, never a crash. GROQ_MODEL is a variable because Groq
	// periodically decommissions model ids — llama3-8b-8192 is already retired,
	// so the default is today's cheap production GPT-OSS 20B. Override to any
	// live model id without a redeploy.
	GROQ_API_KEY: emptyToUndefined(z.string().optional()),
	GROQ_MODEL: z.string().default("openai/gpt-oss-20b"),

	RESEND_API_KEY: emptyToUndefined(z.string().optional()),
	FROM_EMAIL: z.string().default("notifications@elevatedcorehealth.com"),

	GMAIL_USER: emptyToUndefined(z.string().email().optional()),
	GMAIL_APP_PASSWORD: emptyToUndefined(z.string().optional()),

	// Cloudinary (profile avatar uploads) — optional; the avatar endpoint 400s with a clear
	// "not configured" message if these are missing, same pattern as RESEND_API_KEY above.
	CLOUDINARY_CLOUD_NAME: emptyToUndefined(z.string().optional()),
	CLOUDINARY_API_KEY: emptyToUndefined(z.string().optional()),
	CLOUDINARY_API_SECRET: emptyToUndefined(z.string().optional()),

	// Quo (OpenPhone) SMS — optional; every messaging endpoint returns a clear
	// "not configured" error (never a silent no-op) without these, same pattern
	// as RESEND_API_KEY/CLOUDINARY_* above. See lib/quo.ts.
	// The business numbers themselves are NOT env vars — they're discovered at
	// runtime from GET /v1/phone-numbers and filtered to US-messaging-capable
	// ones, so adding a number to the Quo workspace needs no redeploy.
	QUO_API_KEY: emptyToUndefined(z.string().optional()),
	QUO_WEBHOOK_SIGNING_SECRET: emptyToUndefined(z.string().optional()),

	// Pusher — optional; when missing the app degrades to polling-only
	// (no real-time push, but everything else works). See lib/pusher.ts.
	PUSHER_APP_ID: emptyToUndefined(z.string().optional()),
	PUSHER_KEY: emptyToUndefined(z.string().optional()),
	PUSHER_SECRET: emptyToUndefined(z.string().optional()),
	PUSHER_CLUSTER: emptyToUndefined(z.string().optional()),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
	console.error("❌ Invalid environment variables:", parsedEnv.error.format());
	throw new Error("Invalid environment variables");
}

export const env = {
	...parsedEnv.data,
	isDevelopment: parsedEnv.data.NODE_ENV === "development",
	isProduction: parsedEnv.data.NODE_ENV === "production",
	isTest: parsedEnv.data.NODE_ENV === "test",
};
