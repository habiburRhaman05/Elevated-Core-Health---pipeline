import { logger } from "../utils/logger";
import { prisma } from "../utils/prisma";

export const connectToDatabase = async (): Promise<void> => {
	try {
		await prisma.$connect();
		// Never log the connection string — it carries credentials.
		logger.info("Connected to the database.");
	} catch (err) {
		logger.fatal({ err }, "Database connection failed.");
		// On Vercel (serverless), process.exit kills the function silently.
		// Throw instead so the error surfaces in logs / function output.
		if (process.env.VERCEL) {
			throw new Error(`Database connection failed: ${err}`);
		}
		process.exit(1);
	}
};

export { prisma };
