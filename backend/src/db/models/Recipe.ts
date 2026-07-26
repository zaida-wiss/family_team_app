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
  // Mängd/enhet (2026-07-26, Zaidas önskemål) — se shared/types.ts:s
  // RecipeIngredient-kommentar. Kom ihåg att lägga till HÄR i Mongoose-
  // schemat när ett nytt fält läggs i Zod/typerna — samma bugklass som just
  // fixades för Member.todoThreadGap (fältet fanns i Zod men saknades i
  // Mongoose-modellen, så det sparades aldrig, trots att API-svaret var 200).
  ingredients: [
    {
      id: { type: String, required: true },
      text: { type: String, required: true },
      quantity: { type: Number, default: null },
      unit: { type: String, default: null }
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
