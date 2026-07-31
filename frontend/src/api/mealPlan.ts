import type { MealPlanEntry, MealSlot } from "@shared/types";
import { api, request } from "./client";

export const mealPlanApi = {
  getRange: (from: string, until: string) =>
    request<MealPlanEntry[]>(api(`meal-plan?from=${from}&until=${until}`)),
  create: (date: string, mealSlot: MealSlot, recipeId: string) =>
    request<MealPlanEntry>(api("meal-plan"), {
      method: "POST",
      body: JSON.stringify({ date, mealSlot, recipeId })
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`meal-plan/${id}`), { method: "DELETE" })
};
