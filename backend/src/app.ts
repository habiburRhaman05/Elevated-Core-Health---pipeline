import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import errorHandler from "./middlewares/errorHandler";
import { globalErrorHandler } from "./middlewares/globalError";
import rateLimiter from "./middlewares/rateLimiter";
import requestLogger from "./middlewares/requestLogger";
import { apiRouter } from "./moduels/routes";

/**
 * Build the Express app — no app.listen() here.
 *
 * Separation exists so:
 *  - src/server.ts calls listen() for local dev
 *  - src/vercel.ts exports the app for Vercel serverless
 *
 * IMPORTANT: This module does NOT import envConfig at the top level.
 * envConfig validates env vars eagerly and throws if they're missing/invalid.
 * On Vercel, a throw at module-load time crashes the function silently.
 * Instead, env-dependent config reads process.env directly.
 * Full env validation runs lazily when routes/middleware that import envConfig
 * are first invoked — the globalErrorHandler catches any errors and returns
 * a readable JSON 500.
 */

const app: Express = express();

// Trust exactly one reverse-proxy hop (Vercel LB)
app.set("trust proxy", 1);

// Middlewares — read CORS from process.env directly (no envConfig import)
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(helmet());
app.use(rateLimiter);

// Request logging
app.use(requestLogger);

// Health / root
app.get("/", (_req, res) => {
	res.send("Welcome to the Elevated Core Health Pipeline Portal API");
});
app.get("/health", (_req, res) => {
	res.json({ status: "ok", uptime: process.uptime() });
});

// All feature routes live under /api
app.use("/api", apiRouter);

// 404 for unmatched routes + request-scoped error capture
const [notFoundHandler, attachErrorToLog] = errorHandler();
app.use(notFoundHandler);
app.use(attachErrorToLog);
// Final error handler
app.use(globalErrorHandler);

export { app };
