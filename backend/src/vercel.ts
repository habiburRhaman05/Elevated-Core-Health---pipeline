/**
 * Vercel Serverless Entry Point
 *
 * esbuild bundles this file → api/index.js (all @/ aliases resolved at build
 * time, third-party packages stay external).  Vercel serves api/index.js as
 * a serverless function.
 *
 * If env validation fails during cold-start the try/catch below creates a
 * fallback Express app that returns a readable JSON 500 instead of crashing
 * the function silently.
 */

import "dotenv/config";

import express from "express";
import type { Express } from "express";

let app: Express;

try {
	// app.ts reads process.env directly for CORS — no top-level envConfig
	// import that could throw.  Full env validation runs lazily inside
	// middleware when the first API route is hit.
	const mod = await import("./app");
	app = mod.app;
} catch (err) {
	console.error("⚠️  Failed to initialize app:", err);
	const fallback = express();
	fallback.use((_req, res) => {
		res.status(500).json({
			success: false,
			message: "Backend failed to initialize.",
			error: String(err),
		});
	});
	app = fallback;
}

export default app;
