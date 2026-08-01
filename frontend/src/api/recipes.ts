import type { Recipe, RecipeUnit } from "@shared/types";
import { api, request } from "./client";

type RecipeBody = {
  name: string;
  emoji: string | null;
  imageUrl?: string | null;
  sourceUrl?: string | null;
  servings?: number | null;
  tags: string[];
  ingredients: { text: string; quantity: number | null; unit: RecipeUnit | null }[];
  steps: { text: string; timedMinutes: number | null }[];
};

// Familjeanslutningar (ADR-0030, 2026-07-29) — anslutna familjers receptbok,
// läsning oavsett access-nivå (recept är kontobrett, inte medlems-scopat).
export type ConnectionRecipes = {
  accountId: string;
  accountName: string;
  recipes: Recipe[];
};

// Mina familjekonton (2026-08-01, Zaidas önskemål) — mina EGNA riktiga
// medlemskap, används av måltidsplaneringen i Hem-vyn.
export type CrossAccountRecipes = {
  accountId: string;
  accountName: string;
  recipes: Recipe[];
};

export const recipesApi = {
  getAll: () => request<Recipe[]>(api("recipes")),
  getConnectionRecipes: () => request<ConnectionRecipes[]>(api("recipes/connections")),
  getCrossAccountRecipes: () => request<CrossAccountRecipes[]>(api("recipes/cross-account")),
  create: (body: RecipeBody) =>
    request<Recipe>(api("recipes"), { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: RecipeBody) =>
    request<{ ok: boolean }>(api(`recipes/${id}`), { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`recipes/${id}`), { method: "DELETE" })
};
