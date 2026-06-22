import jwt from "jsonwebtoken";
import type { Response } from "express";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret";
const IS_PROD = process.env.NODE_ENV === "production";

export type AccessPayload = { userId: string };

export function signAccess(userId: string) {
  return jwt.sign({ userId } satisfies AccessPayload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function signRefresh(userId: string, tokenVersion: number) {
  return jwt.sign({ userId, tokenVersion }, REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyRefresh(token: string): { userId: string; tokenVersion: number } {
  return jwt.verify(token, REFRESH_SECRET) as { userId: string; tokenVersion: number };
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax"
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
