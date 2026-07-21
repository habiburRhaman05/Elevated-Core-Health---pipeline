import { pino } from "pino";

import { env } from "@/utils/envConfig";

export const logger = pino({
	name: "ech-pipeline-api",
	level: env.isProduction ? "info" : "debug",
});
