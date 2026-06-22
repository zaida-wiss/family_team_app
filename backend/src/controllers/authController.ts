import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { UserModel, registerSchema, loginSchema } from "../db/models/User.js";
import { validate } from "../utils/validate.js";
import { signAccess, signRefresh, verifyRefresh, setRefreshCookie, clearRefreshCookie, fetchMemberships } from "../utils/tokens.js";

export async function register(req: Request, res: Response) {
  const { email, password, name } = validate(registerSchema, req.body);

  const existing = await UserModel.findOne({ email });
  if (existing) {
    res.status(409).json({ error: "E-postadressen är redan registrerad" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = new UserModel({
    id: `user-${crypto.randomUUID()}`,
    email,
    passwordHash,
    name,
    createdAt: new Date().toISOString(),
    tokenVersion: 0
  });
  await user.save();

  setRefreshCookie(res, signRefresh(user.id, 0));
  res.status(201).json({
    accessToken: signAccess(user.id),
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt }
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = validate(loginSchema, req.body);

  const user = await UserModel.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Fel e-postadress eller lösenord" });
    return;
  }

  setRefreshCookie(res, signRefresh(user.id, user.tokenVersion));
  res.json({
    accessToken: signAccess(user.id),
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    memberships: await fetchMemberships(user.id)
  });
}

export async function refresh(req: Request, res: Response) {
  const cookie = (req.cookies as Record<string, string>)["refresh_token"];
  if (!cookie) {
    res.status(401).json({ error: "Ingen refresh token" });
    return;
  }

  let payload: { userId: string; tokenVersion: number };
  try {
    payload = verifyRefresh(cookie);
  } catch {
    res.status(401).json({ error: "Ogiltig refresh token" });
    return;
  }

  const user = await UserModel.findOne({ id: payload.userId });
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    res.status(401).json({ error: "Session ogiltigförklarad, logga in igen" });
    return;
  }

  setRefreshCookie(res, signRefresh(user.id, user.tokenVersion));
  res.json({
    accessToken: signAccess(user.id),
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    memberships: await fetchMemberships(user.id)
  });
}

export function logout(_req: Request, res: Response) {
  clearRefreshCookie(res);
  res.json({ ok: true });
}
