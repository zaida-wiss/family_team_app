import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { invite, getInvitation, acceptInvitation } from "../controllers/invitationsController.js";

export const invitationsRouter = Router();

invitationsRouter.post("/accounts/:accountId/invite", requireAuth, invite);
invitationsRouter.get("/invitations/:token", getInvitation);
invitationsRouter.post("/invitations/:token/accept", acceptInvitation);
