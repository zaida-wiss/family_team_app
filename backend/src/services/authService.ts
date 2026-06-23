import bcrypt from "bcryptjs";
import { UserModel, registerSchema, loginSchema } from "../db/models/User.js";
import { validate } from "../utils/validate.js";
import { signAccess, signRefresh, verifyRefresh, fetchMemberships } from "../utils/tokens.js";
import { AppError } from "../utils/errors.js";

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
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt }
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
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
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
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    memberships: await fetchMemberships(user.id)
  };
}

export function logout() {
  // Nothing to do server-side; cookie is cleared by the route
}
