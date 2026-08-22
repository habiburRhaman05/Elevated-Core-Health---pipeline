// Serverless-safe entry point for Vercel. Unlike src/index.ts (which calls
// httpServer.listen(...) and connectToDatabase()'s process.exit(1)-on-failure
// boot sequence — both wrong for a stateless function invocation), this just
// re-exports the plain Express app. Prisma connects lazily on first query, so
// no explicit connect step is needed here.
import { app } from "@/server";

export default app;
