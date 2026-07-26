import type { Recipe } from "@shared/types";
import { api, request } from "./client";

type RecipeBody = {
  name: string;
  emoji: string | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  servings?: number | null;
  tags: string[];
  ingredients: { text: string }[];
  steps: { text: string; timedMinutes: number | null }[];
};

export const recipesApi = {
  getAll: () => request<Recipe[]>(api("recipes")),
  create: (body: RecipeBody) =>
    request<Recipe>(api("recipes"), { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: RecipeBody) =>
    request<{ ok: boolean }>(api(`recipes/${id}`), { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`recipes/${id}`), { method: "DELETE" })
};
