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

	RESEND_API_KEY: emptyToUndefined(z.string().optional()),
	FROM_EMAIL: z.string().default("notifications@elevatedcorehealth.com"),
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
