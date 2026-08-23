import { Router } from "express";

import { webhooksQuoController } from "./webhooks-quo.controller";

export const webhooksQuoPublicRouter: Router = Router();

// Public — no requireAuth, same posture as patientsPublicRouter's /intake.
// Quo can't log in as a user; the request is authenticated by signature
// verification inside the controller instead (see lib/quo.ts).
webhooksQuoPublicRouter.post("/quo", webhooksQuoController.handleInbound);
