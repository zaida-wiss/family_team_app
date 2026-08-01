import type { MealPlanEntry, MealSlot } from "@shared/types";
import { api, request } from "./client";

// Mina familjekonton (2026-08-01, Zaidas önskemål: "då måste man först göra
// en familj med dessa familjer som medlemmar") — mina EGNA riktiga
// medlemskap, ALDRIG en Familjeanslutning.
export type CrossAccountMealPlan = {
  accountId: string;
  accountName: string;
  entries: MealPlanEntry[];
};

export const mealPlanApi = {
  getRange: (from: string, until: string) =>
    request<MealPlanEntry[]>(api(`meal-plan?from=${from}&until=${until}`)),
  create: (date: string, mealSlot: MealSlot, recipeId: string) =>
    request<MealPlanEntry>(api("meal-plan"), {
      method: "POST",
      body: JSON.stringify({ date, mealSlot, recipeId })
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`meal-plan/${id}`), { method: "DELETE" }),
  getCrossAccountRange: (from: string, until: string) =>
    request<CrossAccountMealPlan[]>(api(`meal-plan/cross-account?from=${from}&until=${until}`)),
  createCrossAccount: (targetAccountId: string, date: string, mealSlot: MealSlot, recipeId: string) =>
    request<MealPlanEntry>(api(`meal-plan/cross-account/${targetAccountId}`), {
      method: "POST",
      body: JSON.stringify({ date, mealSlot, recipeId })
    }),
  removeCrossAccount: (targetAccountId: string, id: string) =>
    request<{ ok: boolean }>(api(`meal-plan/cross-account/${targetAccountId}/${id}`), { method: "DELETE" })
};
