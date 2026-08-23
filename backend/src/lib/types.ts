import type { UserRole } from "@/config/roles";

export interface AuthenticatedUser {
	id: string;
	name: string;
	email: string;
	role: UserRole;
	avatar: string | null;
}

declare global {
	namespace Express {
		interface Request {
			user?: AuthenticatedUser;
			/**
			 * Exact raw request bytes, captured by express.json()'s `verify`
			 * callback in app.ts. Needed for the Quo webhook: signature
			 * verification must run over the EXACT bytes Quo signed — re-
			 * stringifying the already-parsed `req.body` can produce different
			 * whitespace/key-order and silently break verification.
			 */
			rawBody?: Buffer;
		}
	}
}
