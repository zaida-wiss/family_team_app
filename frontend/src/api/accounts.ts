import type { Account, Membership } from "@shared/types";
import { api, request } from "./client";

export const accountsApi = {
  setup: (name: string) =>
    request<{ membership: Membership }>(api("accounts/setup"), {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  get: (id: string) => request<Account>(api(`accounts/${id}`)),
  update: (id: string, patch: Partial<Account>) =>
    request<{ ok: boolean }>(api(`accounts/${id}`), { method: "PUT", body: JSON.stringify(patch) }),
  export: (id: string) =>
    request<unknown>(api(`accounts/${id}/export`)),
  delete: (id: string) =>
    request<{ ok: boolean }>(api(`accounts/${id}`), { method: "DELETE" })
};
