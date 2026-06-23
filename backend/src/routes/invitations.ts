import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as invitationsService from "../services/invitationsService.js";
import { setRefreshCookie } from "../utils/tokens.js";

export const invitationsRouter = Router();

invitationsRouter.post("/accounts/:accountId/invite", requireAuth, async (req, res) => {
  res.status(201).json(await invitationsService.invite(req.params.accountId, req.memberId, req.body));
});

invitationsRouter.get("/invitations/:token", async (req, res) => {
  res.json(await invitationsService.getInvitation(req.params.token));
});

invitationsRouter.post("/invitations/:token/accept", async (req, res) => {
  const { refreshToken, accessToken, user, memberships } = await invitationsService.acceptInvitation(req.params.token, req.body);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken, user, memberships });
});
