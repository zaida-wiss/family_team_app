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
  logout: () => request<{ ok: boolean }>(api("auth/logout"), { method: "POST", body: "{}" })
};
