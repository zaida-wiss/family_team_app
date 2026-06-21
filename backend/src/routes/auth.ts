import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { UserModel, registerSchema, loginSchema } from "../db/models/User.js";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
import type { AccessPayload } from "../middleware/auth.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret";
const IS_PROD = process.env.NODE_ENV === "production";

function signAccess(userId: string) {
  return jwt.sign({ userId } satisfies AccessPayload, ACCESS_SECRET, { expiresIn: "15m" });
}

function signRefresh(userId: string, tokenVersion: number) {
  return jwt.sign({ userId, tokenVersion }, REFRESH_SECRET, { expiresIn: "7d" });
}

function setRefreshCookie(response: Parameters<Router>[1], token: string) {
  response.cookie("refresh_token", token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new Error(result.error.errors[0]?.message ?? "Ogiltiga värden");
    (err as { status?: number }).status = 400;
    throw err;
  }
  return result.data;
}

export const authRouter = Router();

authRouter.post("/register", async (request, response) => {
  const { email, password, name } = validate(registerSchema, request.body);

  const existing = await UserModel.findOne({ email });
  if (existing) {
    response.status(409).json({ error: "E-postadressen är redan registrerad" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date().toISOString();
  const user = new UserModel({
    id: `user-${crypto.randomUUID()}`,
    email,
    passwordHash,
    name,
    createdAt: now,
    tokenVersion: 0
  });
  await user.save();

  const accessToken = signAccess(user.id);
  const refreshToken = signRefresh(user.id, 0);
  setRefreshCookie(response, refreshToken);

  response.status(201).json({
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt }
  });
});

authRouter.post("/login", async (request, response) => {
  const { email, password } = validate(loginSchema, request.body);

  const user = await UserModel.findOne({ email });
  if (!user) {
    response.status(401).json({ error: "Fel e-postadress eller lösenord" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    response.status(401).json({ error: "Fel e-postadress eller lösenord" });
    return;
  }

  const members = await MemberModel.find({ userId: user.id, deletedAt: null }, { _id: 0, __v: 0 });
  const accountIds = [...new Set(members.map((m) => m.accountId))];
  const accounts = await AccountModel.find({ id: { $in: accountIds } }, { _id: 0, __v: 0 });

  const memberships = members.map((m) => ({
    member: m.toObject(),
    account: accounts.find((a) => a.id === m.accountId)
  }));

  const accessToken = signAccess(user.id);
  const refreshToken = signRefresh(user.id, user.tokenVersion);
  setRefreshCookie(response, refreshToken);

  response.json({
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    memberships
  });
});

authRouter.post("/refresh", async (request, response) => {
  const token = (request.cookies as Record<string, string>)["refresh_token"];
  if (!token) {
    response.status(401).json({ error: "Ingen refresh token" });
    return;
  }

  let payload: { userId: string; tokenVersion: number };
  try {
    payload = jwt.verify(token, REFRESH_SECRET) as typeof payload;
  } catch {
    response.status(401).json({ error: "Ogiltig refresh token" });
    return;
  }

  const user = await UserModel.findOne({ id: payload.userId });
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    response.status(401).json({ error: "Session ogiltigförklarad, logga in igen" });
    return;
  }

  const members = await MemberModel.find({ userId: user.id, deletedAt: null }, { _id: 0, __v: 0 });
  const accountIds = [...new Set(members.map((m) => m.accountId))];
  const accounts = await AccountModel.find({ id: { $in: accountIds } }, { _id: 0, __v: 0 });
  const memberships = members.map((m) => ({
    member: m.toObject(),
    account: accounts.find((a) => a.id === m.accountId)
  }));

  const accessToken = signAccess(user.id);
  const refreshToken = signRefresh(user.id, user.tokenVersion);
  setRefreshCookie(response, refreshToken);

  response.json({
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    memberships
  });
});

authRouter.post("/logout", (_request, response) => {
  response.clearCookie("refresh_token", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax"
  });
  response.json({ ok: true });
});
