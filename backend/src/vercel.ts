/**
 * Vercel Serverless Entry Point
 *
 * Bundled by tsup → dist/vercel.js. Vercel serves this as a serverless function.
 * All path aliases (@/) are resolved at bundle time — no alias issues at runtime.
 *
 * The DB connection is lazily established on first request via Prisma's
 * globalThis caching pattern in utils/prisma.ts (no extra setup needed).
 */

// Ensure env vars are loaded before anything else
import "dotenv/config";

import { app } from "./server";

// Vercel expects a default export of the request handler.
// Express app itself is a valid handler — Vercel calls it as (req, res).
export default app;
