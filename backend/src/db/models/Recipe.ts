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
  imageUrl: { type: String, default: null },
  sourceUrl: { type: String, default: null },
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
  // Antal personer (2026-07-26, Zaidas önskemål) — valfritt tal.
  servings: { type: Number, default: null },
  tags: [{ type: String }],
  // required + default (2026-07-26, Zaidas fynd: "för created at eller
  // något datum krävs" — den riktiga felmeddelandetexten syntes först efter
  // gårdagens fix av felbanner-dubbelrapporteringen). createdAt tillkom i en
  // SENARE commit samma dag (431675f) än receptpanelens allra första version
  // (ce26f7f) — recept skapade i det mellanrummet saknar fältet helt i
  // databasen. Mongoose applicerar defaultet vid HYDRERING av ett befintligt
  // dokument också, inte bara vid create(), så nästa gång ett sådant recept
  // laddas och .save():as (update ELLER delete, båda validerar HELA
  // dokumentet) fylls fältet i automatiskt istället för att kasta
  // "createdAt: Path `createdAt` is required." — självläkande, ingen
  // separat migrering/databasskrivning behövs.
  createdAt: { type: String, required: true, default: () => new Date().toISOString() },
  createdBy: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

recipeSchema.index({ accountId: 1 });

export const RecipeModel = model<Recipe>("Recipe", recipeSchema);
