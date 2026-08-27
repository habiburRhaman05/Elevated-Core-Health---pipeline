import { pino } from "pino";
import { createServer } from "node:http";
import { connectToDatabase } from "@/config/db";
import { app } from "./app";
import { env } from "./utils/envConfig";

const logger = pino({ name: "server start" });

// Re-export for backward compatibility (index.ts imports { app, logger })
export { app, logger };

const httpServer = createServer(app);

const server = httpServer.listen(env.PORT, async () => {
	await connectToDatabase();
	const { NODE_ENV, HOST, PORT } = env;
	console.log(`ECH Pipeline Portal (${NODE_ENV}) running on http://${HOST}:${PORT}`);
});

const onCloseSignal = () => {
	console.log("sigint received, shutting down");
	server.close(() => {
		console.log("server closed");
		process.exit();
	});
	setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
