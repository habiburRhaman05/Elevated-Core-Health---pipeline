import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pino } from "pino";
import errorHandler from "./middlewares/errorHandler";
import { globalErrorHandler } from "./middlewares/globalError";
import rateLimiter from "./middlewares/rateLimiter";
import requestLogger from "./middlewares/requestLogger";
import { apiRouter } from "./moduels/routes";
import { env } from "./utils/envConfig";

const logger = pino({ name: "server start" });
const app: Express = express();

// Trust exactly one reverse-proxy hop (e.g. Nginx / the platform LB) so `req.ip`
// reflects the real client. `true` trusts every hop, which lets a client spoof
// X-Forwarded-For and trivially bypass IP rate limiting — express-rate-limit v8
// rejects that permissive setting outright (ERR_ERL_PERMISSIVE_TRUST_PROXY).
app.set("trust proxy", 1);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
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

// 404 for unmatched routes + request-scoped error capture (from the boilerplate)
const [notFoundHandler, attachErrorToLog] = errorHandler();
app.use(notFoundHandler);
app.use(attachErrorToLog);
// Final error handler: maps AppError and unknown errors to ServiceResponse
app.use(globalErrorHandler);

export { app, logger };
