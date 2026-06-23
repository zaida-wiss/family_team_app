import type { Member } from "@shared/types";
import { api, request } from "./client";

export const membersApi = {
  getAll: () => request<Member[]>(api("members")),
  create: (member: Member) =>
    request<{ id: string }>(api("members"), { method: "POST", body: JSON.stringify(member) }),
  update: (id: string, patch: Partial<Member>) =>
    request<{ ok: boolean }>(api(`members/${id}`), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`members/${id}`), { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`members/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    })
};
