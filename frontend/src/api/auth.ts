import type { Membership, User } from "@shared/types";
import { api, request } from "./client";

type LoginResponse = { accessToken: string; user: User; memberships: Membership[] };
type RegisterResponse = { accessToken: string; user: User };

export const authApi = {
  register: (email: string, password: string, name: string) =>
    request<RegisterResponse>(api("auth/register"), {
      method: "POST",
      body: JSON.stringify({ email, password, name })
    }),
  login: (email: string, password: string) =>
    request<LoginResponse>(api("auth/login"), {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  refresh: () => request<LoginResponse>(api("auth/refresh"), { method: "POST", body: "{}" }, true),
  logout: () => request<{ ok: boolean }>(api("auth/logout"), { method: "POST", body: "{}" }),
  updatePreferences: (patch: Pick<User, "lastActiveMemberId">) =>
    request<{ user: User }>(api("auth/preferences"), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>(api("auth/forgot-password"), { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>(api("auth/reset-password"), { method: "POST", body: JSON.stringify({ token, password }) })
};
