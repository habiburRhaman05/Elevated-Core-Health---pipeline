import { pino } from "pino";

import { app } from "./app";

const logger = pino({ name: "server start" });

/**
 * Assembles the Express app and the shared logger — and deliberately does NOT
 * listen. `index.ts` is the single entrypoint: it creates the HTTP server,
 * attaches the realtime WebSocket handler, and calls listen() exactly once.
 *
 * This module used to create its own httpServer and call
 * `httpServer.listen(env.PORT)` at module scope. Since index.ts imports from
 * here, that ran on import and bound the port, so index.ts's own listen() on
 * the same port then always failed with EADDRINUSE. The listening lives in one
 * place now; do not reintroduce a listen() call here.
 */
export { app, logger };
