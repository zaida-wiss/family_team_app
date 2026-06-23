import type { Reward } from "@shared/types";
import { api, request } from "./client";

export const rewardsApi = {
  getAll: () => request<Reward[]>(api("rewards")),
  create: (reward: Reward) =>
    request<{ id: string }>(api("rewards"), { method: "POST", body: JSON.stringify(reward) }),
  approve: (id: string, starsNeeded: number) =>
    request<{ ok: boolean }>(api(`rewards/${id}/approve`), {
      method: "PATCH",
      body: JSON.stringify({ starsNeeded })
    }),
  reject: (id: string) =>
    request<{ ok: boolean }>(api(`rewards/${id}/reject`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  redeem: (id: string) =>
    request<{ ok: boolean }>(api(`rewards/${id}/redeem`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`rewards/${id}`), { method: "DELETE" })
};
