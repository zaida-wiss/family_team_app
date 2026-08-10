import type { Membership, User } from "@shared/types";
import { api, request } from "./client";

// Registrering skapar sedan 2026-08-10 automatiskt ett personligt konto
// (se ADR-0032) — svaret bär därför samma form som login/refresh.
type LoginResponse = { accessToken: string; user: User; memberships: Membership[] };

export const authApi = {
  register: (email: string, password: string, name: string) =>
    request<LoginResponse>(api("auth/register"), {
      method: "POST",
      body: JSON.stringify({ email, password, name })
    }),
  login: (email: string, password: string) =>
    request<LoginResponse>(api("auth/login"), {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  childLogin: (parentEmail: string, username: string, password: string) =>
    request<LoginResponse>(api("auth/child-login"), {
      method: "POST",
      body: JSON.stringify({ parentEmail, username, password })
    }),
  refresh: () => request<LoginResponse>(api("auth/refresh"), { method: "POST", body: "{}" }, true),
  logout: () => request<{ ok: boolean }>(api("auth/logout"), { method: "POST", body: "{}" }),
  updatePreferences: (patch: Pick<User, "lastActiveMemberId">) =>
    request<{ user: User }>(api("auth/preferences"), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  // 2026-08-10: kontonivå-avatar, cascadar till familjer där medlemmen
  // saknar en egen avatarUrl (se membersService.ts:s resolveAvatars).
  updateMyAvatar: (avatarUrl: string | null) =>
    request<{ user: User }>(api("auth/avatar"), {
      method: "PATCH",
      body: JSON.stringify({ avatarUrl })
    }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>(api("auth/forgot-password"), { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>(api("auth/reset-password"), { method: "POST", body: JSON.stringify({ token, password }) })
};
