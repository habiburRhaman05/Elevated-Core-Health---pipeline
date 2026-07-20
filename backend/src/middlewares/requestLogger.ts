import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import pino from "pino";
import pinoHttp from "pino-http";
import pretty from "pino-pretty";

import { env } from "@/utils/envConfig";

// In development, pretty-print via a synchronous stream rather than a
// `transport: { target: "pino-pretty" }` worker thread: the worker (thread-stream)
// crashes with "this should not happen: undefined" under Node 24 + tsx --watch.
// Passing pino-pretty as a stream keeps the readable output without a worker.
const logger = env.isProduction ? pino({ level: "info" }) : pino({ level: "debug" }, pretty({ colorize: true }));

const getLogLevel = (status: number) => {
	if (status >= StatusCodes.INTERNAL_SERVER_ERROR) return "error";
	if (status >= StatusCodes.BAD_REQUEST) return "warn";
	return "info";
};

const addRequestId = (req: Request, res: Response, next: NextFunction) => {
	const existingId = req.headers["x-request-id"] as string;
	const requestId = existingId || randomUUID();

	// Set for downstream use
	req.headers["x-request-id"] = requestId;
	res.setHeader("X-Request-Id", requestId);

	next();
};

const httpLogger = pinoHttp({
	logger,
	genReqId: (req) => req.headers["x-request-id"] as string,
	customLogLevel: (_req, res) => getLogLevel(res.statusCode),
	customSuccessMessage: (req) => `${req.method} ${req.url} completed`,
	customErrorMessage: (_req, res) => `Request failed with status code: ${res.statusCode}`,
	// Only log response bodies in development
	serializers: {
		req: (req) => ({
			method: req.method,
			url: req.url,
			id: req.id,
		}),
	},
});

const captureResponseBody = (_req: Request, res: Response, next: NextFunction) => {
	if (!env.isProduction) {
		const originalSend = res.send;
		res.send = function (body) {
			res.locals.responseBody = body;
			return originalSend.call(this, body);
		};
	}
	next();
};

export default [addRequestId, captureResponseBody, httpLogger];
