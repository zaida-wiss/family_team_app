import { Router } from "express";
import * as authService from "../services/authService.js";
import { requireAuth, requireSameOrigin } from "../middleware/auth.js";
import { setRefreshCookie, clearRefreshCookie } from "../utils/tokens.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { email, password, name } = req.body;
  const { refreshToken, accessToken, user } = await authService.register(email, password, name);
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ accessToken, user });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const { refreshToken, accessToken, user, memberships } = await authService.login(email, password);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken, user, memberships });
});

authRouter.post("/refresh", requireSameOrigin, async (req, res) => {
  const cookie = (req.cookies as Record<string, string>)["refresh_token"];
  const { refreshToken, accessToken, user, memberships } = await authService.refresh(cookie);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken, user, memberships });
});

authRouter.post("/logout", requireSameOrigin, (_req, res) => {
  authService.logout();
  clearRefreshCookie(res);
  res.json({ ok: true });
});

authRouter.patch("/preferences", requireAuth, async (req, res) => {
  res.json({
    user: await authService.updatePreferences(req.userId!, {
      lastActiveMemberId: req.body.lastActiveMemberId ?? null
    })
  });
});

authRouter.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  await authService.forgotPassword(email ?? "");
  res.json({ ok: true }); // Always succeed to avoid email enumeration
});

authRouter.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);
  res.json({ ok: true });
});
