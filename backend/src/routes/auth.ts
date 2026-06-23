import { Router } from "express";
import * as authService from "../services/authService.js";
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

authRouter.post("/refresh", async (req, res) => {
  const cookie = (req.cookies as Record<string, string>)["refresh_token"];
  const { refreshToken, accessToken, user, memberships } = await authService.refresh(cookie);
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken, user, memberships });
});

authRouter.post("/logout", (_req, res) => {
  authService.logout();
  clearRefreshCookie(res);
  res.json({ ok: true });
});
