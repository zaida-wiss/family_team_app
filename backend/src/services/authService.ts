import bcrypt from "bcryptjs";
import crypto from "crypto";
import { UserModel, registerSchema, loginSchema } from "../db/models/User.js";
import { validate } from "../utils/validate.js";
import { signAccess, signRefresh, verifyRefresh, fetchMemberships } from "../utils/tokens.js";
import { AppError } from "../utils/errors.js";
import { sendPasswordResetEmail } from "../utils/email.js";

function toPublicUser(user: { id: string; email: string; name: string; createdAt: string; lastActiveMemberId?: string | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    lastActiveMemberId: user.lastActiveMemberId ?? null
  };
}

export async function register(email: string, password: string, name: string) {
  validate(registerSchema, { email, password, name });

  const existing = await UserModel.findOne({ email });
  if (existing) {
    throw new AppError(409, "E-postadressen är redan registrerad");
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

  const refreshToken = signRefresh(user.id, 0);
  const accessToken = signAccess(user.id);
  return {
    refreshToken,
    accessToken,
    user: toPublicUser(user)
  };
}

export async function login(email: string, password: string) {
  validate(loginSchema, { email, password });

  const user = await UserModel.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, "Fel e-postadress eller lösenord");
  }

  const refreshToken = signRefresh(user.id, user.tokenVersion);
  const accessToken = signAccess(user.id);
  return {
    refreshToken,
    accessToken,
    user: toPublicUser(user),
    memberships: await fetchMemberships(user.id)
  };
}

export async function refresh(cookie: string | undefined) {
  if (!cookie) {
    throw new AppError(401, "Ingen refresh token");
  }

  let payload: { userId: string; tokenVersion: number };
  try {
    payload = verifyRefresh(cookie);
  } catch {
    throw new AppError(401, "Ogiltig refresh token");
  }

  const user = await UserModel.findOne({ id: payload.userId });
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new AppError(401, "Session ogiltigförklarad, logga in igen");
  }

  const refreshToken = signRefresh(user.id, user.tokenVersion);
  const accessToken = signAccess(user.id);
  return {
    refreshToken,
    accessToken,
    user: toPublicUser(user),
    memberships: await fetchMemberships(user.id)
  };
}

export async function updatePreferences(userId: string, patch: { lastActiveMemberId?: string | null }) {
  const user = await UserModel.findOne({ id: userId });
  if (!user) {
    throw new AppError(404, "Användare hittades inte");
  }

  if ("lastActiveMemberId" in patch) {
    user.lastActiveMemberId = patch.lastActiveMemberId ?? null;
  }

  await user.save();
  return toPublicUser(user);
}

export function logout() {
  // Nothing to do server-side; cookie is cleared by the route
}

export async function forgotPassword(email: string) {
  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) return; // Reveal nothing — always succeed silently

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpiry = expiry;
  await user.save();

  await sendPasswordResetEmail(user.email, token);
}

export async function resetPassword(token: string, newPassword: string) {
  if (!token || newPassword.length < 8) {
    throw new AppError(400, "Ogiltigt token eller lösenord för kort");
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await UserModel.findOne({ passwordResetTokenHash: tokenHash });

  if (!user || !user.passwordResetExpiry || new Date(user.passwordResetExpiry) < new Date()) {
    throw new AppError(400, "Länken är ogiltig eller har gått ut");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.tokenVersion += 1; // Invalidate all existing sessions
  user.passwordResetTokenHash = null;
  user.passwordResetExpiry = null;
  await user.save();
}
