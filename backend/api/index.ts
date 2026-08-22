// Vercel's function entry point (see vercel.json's catch-all rewrite for
// routing). Deliberately imports the already-bundled dist output, not raw
// src/ — plain relative import only, no "@/*" aliases, so Vercel's own
// function bundler never needs to understand our tsconfig paths.
//
// IMPORTANT: this only works because vercel.json's buildCommand actually
// runs (prisma generate + tsup) before Vercel scans this /api directory.
// Do NOT reintroduce a legacy `builds`/`routes` vercel.json — that format
// skips buildCommand entirely, which is exactly what broke this deploy
// (dist/vercel.js never got created, so there was no function to serve).
import app from "../dist/vercel.js";

export default app;
