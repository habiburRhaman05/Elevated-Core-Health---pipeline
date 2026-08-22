<<<<<<< Updated upstream
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
=======
// Vercel's single entry point for every request (see vercel.json's catch-all
// rewrite). Deliberately imports the already-bundled dist output, not raw
// src/ — Vercel's own function bundler doesn't understand the "@/*" path
// aliases used throughout src/, but tsup already resolved those when it
// produced dist/vercel-handler.js during the build step (npm run build /
// vercel-build), so this file only ever needs a plain relative import.
import app from "../dist/vercel-handler.js";

>>>>>>> Stashed changes
export default app;
