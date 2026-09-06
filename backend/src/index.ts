import { createServer } from "node:http";
// biome-ignore lint/correctness/noUnusedImports: only unused while the cron.schedule call below is temporarily commented out — see that block.
import cron from "node-cron";
import { connectToDatabase } from "@/config/db";
import { attachRealtime } from "@/lib/realtime";
// biome-ignore lint/correctness/noUnusedImports: only unused while the cron.schedule call below is temporarily commented out — see that block.
import { patientsService } from "@/moduels/patients/patients.service";
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

// Grow Therapy calendar sync — dev-only in-process scheduler. Vercel has no
// long-lived process to hold a timer in, so production relies entirely on
// Vercel Cron hitting GET /api/patients/intake/grow-therapy on the same
// schedule instead (see vercel.json) — this branch never runs there because
// src/vercel.ts bundles src/app.ts directly and never imports this file.
//
// TEMPORARILY DISABLED (2026-09-06) while manually testing the sync logic —
// running this alongside a manually-curled request (or a second dev server
// instance) is exactly what produced the duplicate-patient bug during
// testing. The route itself (GET/POST /api/patients/intake/grow-therapy) is
// still fully live for manual/curl testing; only the automatic 10-minute
// tick is paused. Re-enable by uncommenting once testing is done.
if (env.isDevelopment && env.GROW_THERAPY_ICS_URL) {
	logger.warn("Grow Therapy calendar auto-sync is temporarily disabled — trigger it manually via GET/POST /api/patients/intake/grow-therapy");
	// cron.schedule("*/10 * * * *", async () => {
	// 	try {
	// 		await patientsService.syncGrowTherapy(env.GROW_THERAPY_ICS_URL as string);
	// 	} catch (err) {
	// 		// syncGrowTherapy already catches and reports its own errors as a
	// 		// failure ServiceResponse — this catch only guards against
	// 		// something throwing before that (e.g. an unexpected rejection),
	// 		// so a bad run can never crash the dev server's cron loop.
	// 		logger.error({ err }, "Grow Therapy dev cron tick — unexpected error");
	// 	}
	// });
	// logger.info("Grow Therapy calendar sync scheduled every 10 minutes (development)");
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
