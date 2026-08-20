/**
 * Vercel Serverless Entry Point
 *
 * This file is the entry point for Vercel's serverless functions.
 * It imports the Express app and exports it as the default handler.
 * Vercel handles the HTTP server lifecycle — no app.listen() needed.
 *
 * The DB connection is lazily established on first request via Prisma's
 * globalThis caching pattern in utils/prisma.ts (no extra setup needed).
 */

// Ensure env vars are loaded before anything else
import "dotenv/config";

import { app } from "@/server";

// Vercel expects a default export of the request handler.
// Express app itself is a valid handler — Vercel calls it as (req, res).
export default app;
