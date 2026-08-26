import { createServer } from "node:http";
import { connectToDatabase } from "@/config/db";
import { attachRealtime } from "@/lib/realtime";
import { app, logger } from "@/server";
import { env } from "@/utils/envConfig";

const httpServer = createServer(app);
// Link Internal Board's typing/presence/new-message push (and the SMS
// module's own realtime nudges) both ride this one WebSocket server.
attachRealtime(httpServer);

const server = httpServer.listen(env.PORT, async () => {
	await connectToDatabase();
	const { NODE_ENV, HOST, PORT } = env;
	logger.info(`ECH Pipeline Portal (${NODE_ENV}) running on http://${HOST}:${PORT}`);
});

const onCloseSignal = () => {
	logger.info("sigint received, shutting down");
	server.close(() => {
		logger.info("server closed");
		process.exit();
	});
	setTimeout(() => process.exit(1), 10000).unref(); // Force shutdown after 10s
};

process.on("SIGINT", onCloseSignal);
process.on("SIGTERM", onCloseSignal);
