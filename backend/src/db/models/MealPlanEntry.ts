import { Schema, model } from "mongoose";
import type { MealPlanEntry } from "../../../../shared/types.js";

// Vecko-måltidsplanering (2026-07-31) — kontobrett (som Recipe), mutationer
// kräver en vuxen (requireAdultMember återanvänd rakt av). En rad = ett
// recept kopplat till en specifik dag+måltid, ingen upprepning i v1.
const mealPlanEntrySchema = new Schema<MealPlanEntry>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  date: { type: String, required: true },
  mealSlot: { type: String, required: true },
  recipeId: { type: String, required: true },
  createdBy: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

mealPlanEntrySchema.index({ accountId: 1, date: 1 });

export const MealPlanEntryModel = model<MealPlanEntry>("MealPlanEntry", mealPlanEntrySchema);
