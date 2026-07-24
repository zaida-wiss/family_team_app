import type { Recipe } from "@shared/types";
import { api, request } from "./client";

export const recipesApi = {
  getAll: () => request<Recipe[]>(api("recipes")),
  create: (body: { name: string; emoji: string | null; ingredients: { text: string }[]; steps: { text: string; timedMinutes: number | null }[] }) =>
    request<Recipe>(api("recipes"), { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: { name: string; emoji: string | null; ingredients: { text: string }[]; steps: { text: string; timedMinutes: number | null }[] }) =>
    request<{ ok: boolean }>(api(`recipes/${id}`), { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`recipes/${id}`), { method: "DELETE" })
};
