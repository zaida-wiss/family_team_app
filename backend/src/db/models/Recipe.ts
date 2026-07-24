import { Schema, model } from "mongoose";
import type { Recipe } from "../../../../shared/types.js";

// Recept (2026-07-25, ADR-0028) — kontobrett som TodoCategory (ADR-0019),
// mutationer kräver en vuxen (todoCategoriesService.ts:s requireAdultMember
// återanvänd rakt av).
const recipeSchema = new Schema<Recipe>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  name: { type: String, required: true },
  emoji: { type: String, default: null },
  ingredients: [
    {
      id: { type: String, required: true },
      text: { type: String, required: true }
    }
  ],
  steps: [
    {
      id: { type: String, required: true },
      text: { type: String, required: true },
      timedMinutes: { type: Number, default: null }
    }
  ],
  createdBy: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

recipeSchema.index({ accountId: 1 });

export const RecipeModel = model<Recipe>("Recipe", recipeSchema);
