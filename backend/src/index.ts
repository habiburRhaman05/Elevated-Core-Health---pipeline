import { createServer } from "node:http";
import cron from "node-cron";
import { connectToDatabase } from "@/config/db";
import { attachRealtime } from "@/lib/realtime";
import { patientsService } from "@/moduels/patients/patients.service";
import { app, logger } from "@/server";
import { env } from "@/utils/envConfig";

const httpServer = createServer(app);

attachRealtime(httpServer);

const server = httpServer.listen(env.PORT, async () => {
	await connectToDatabase();
	const { NODE_ENV, HOST, PORT } = env;
	logger.info(`ECH Pipeline Portal (${NODE_ENV}) running on http://${HOST}:${PORT}`);
});


if (env.isDevelopment && env.GROW_THERAPY_ICS_URL) {
	cron.schedule("*/1 * * * *", async () => {
		try {
			await patientsService.syncGrowTherapy(env.GROW_THERAPY_ICS_URL as string);
		} catch (err) {
			logger.error({ err }, "Grow Therapy dev cron tick — unexpected error");
		}
	});
	logger.info("Grow Therapy calendar sync scheduled every minute (development)");
} else if (env.isDevelopment) {
	logger.warn("GROW_THERAPY_ICS_URL not set — Grow Therapy calendar sync is disabled");
}

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
