import jwt from "jsonwebtoken";
import type { Response } from "express";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";

function requireSecret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} saknas — sätt den i miljövariablerna innan servern startar (se .env.example)`);
  }
  return value;
}

const ACCESS_SECRET = requireSecret("JWT_ACCESS_SECRET");
const REFRESH_SECRET = requireSecret("JWT_REFRESH_SECRET");
const JWT_ALGORITHM = "HS256" as const;
const IS_PROD = (process.env.FRONTEND_URL ?? "http://localhost").startsWith("https://");
const COOKIE_SAME_SITE = IS_PROD ? "none" : "lax";
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type AccessPayload = { userId: string };

export function signAccess(userId: string) {
  return jwt.sign({ userId } satisfies AccessPayload, ACCESS_SECRET, { expiresIn: "15m", algorithm: JWT_ALGORITHM });
}

export function signRefresh(userId: string, tokenVersion: number) {
  return jwt.sign({ userId, tokenVersion }, REFRESH_SECRET, { expiresIn: "7d", algorithm: JWT_ALGORITHM });
}

export function verifyAccess(token: string): AccessPayload {
  return jwt.verify(token, ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] }) as AccessPayload;
}

export function verifyRefresh(token: string): { userId: string; tokenVersion: number } {
  return jwt.verify(token, REFRESH_SECRET, { algorithms: [JWT_ALGORITHM] }) as { userId: string; tokenVersion: number };
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: COOKIE_SAME_SITE,
    maxAge: REFRESH_MAX_AGE_MS
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: COOKIE_SAME_SITE
  });
}

export async function fetchMemberships(userId: string) {
  const members = await MemberModel.find({ userId, deletedAt: null }, { _id: 0, __v: 0 });
  const accountIds = [...new Set(members.map((m) => m.accountId))];
  const accounts = await AccountModel.find({ id: { $in: accountIds } }, { _id: 0, __v: 0 });
  return members.map((m) => ({
    member: m.toObject(),
    account: accounts.find((a) => a.id === m.accountId)
  }));
}
