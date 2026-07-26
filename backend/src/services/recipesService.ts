import crypto from "crypto";
import { RecipeModel } from "../db/models/Recipe.js";
import { AppError } from "../utils/errors.js";
import { requireAdultMember } from "./todoCategoriesService.js";

// Recept (2026-07-25, ADR-0028) — kontobrett (som TodoCategory), mutationer
// kräver en vuxen. Ingredienser/steg är fri text, ingen strukturerad
// mängd/enhet-uppdelning i denna första version.

export async function getAllRecipes(accountId: string) {
  return RecipeModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).sort({ name: 1 });
}

type RecipeInput = {
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  ingredients: { text: string }[];
  steps: { text: string; timedMinutes: number | null }[];
  tags: string[];
};

function normalizeInput(body: unknown): RecipeInput {
  const b = body as Partial<RecipeInput>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw new AppError(400, "Receptets namn kan inte vara tomt");
  return {
    name,
    emoji: typeof b.emoji === "string" && b.emoji ? b.emoji : null,
    imageUrl: typeof b.imageUrl === "string" && b.imageUrl ? b.imageUrl : null,
    ingredients: Array.isArray(b.ingredients)
      ? b.ingredients.map((i) => ({ text: String((i as { text: unknown }).text ?? "").trim() })).filter((i) => i.text)
      : [],
    steps: Array.isArray(b.steps)
      ? b.steps.map((s) => ({
          text: String((s as { text: unknown }).text ?? "").trim(),
          timedMinutes:
            typeof (s as { timedMinutes: unknown }).timedMinutes === "number"
              ? (s as { timedMinutes: number }).timedMinutes
              : null
        })).filter((s) => s.text)
      : [],
    // Söktaggar (2026-07-25) — fri text, trimmade, tomma/dubbletter bortfiltrerade.
    tags: Array.isArray(b.tags)
      ? [...new Set(b.tags.map((t) => String(t).trim()).filter(Boolean))]
      : []
  };
}

export async function createRecipe(accountId: string, memberId: string | null, body: unknown) {
  await requireAdultMember(memberId, accountId);
  const input = normalizeInput(body);
  const recipe = await RecipeModel.create({
    id: `recipe-${crypto.randomUUID()}`,
    accountId,
    name: input.name,
    emoji: input.emoji,
    imageUrl: input.imageUrl,
    ingredients: input.ingredients.map((i) => ({ id: `recipe-ing-${crypto.randomUUID()}`, ...i })),
    steps: input.steps.map((s) => ({ id: `recipe-step-${crypto.randomUUID()}`, ...s })),
    tags: input.tags,
    createdAt: new Date().toISOString(),
    createdBy: memberId,
    deletedAt: null,
    deletedBy: null
  });
  return recipe.toObject();
}

async function findRecipeInAccount(id: string, accountId: string) {
  const recipe = await RecipeModel.findOne({ id, accountId, deletedAt: null });
  if (!recipe) {
    throw new AppError(404, "Recept hittades inte");
  }
  return recipe;
}

export async function updateRecipe(id: string, accountId: string, memberId: string | null, body: unknown) {
  await requireAdultMember(memberId, accountId);
  const input = normalizeInput(body);
  const recipe = await findRecipeInAccount(id, accountId);
  recipe.name = input.name;
  recipe.emoji = input.emoji;
  recipe.imageUrl = input.imageUrl;
  recipe.ingredients = input.ingredients.map((i) => ({ id: `recipe-ing-${crypto.randomUUID()}`, ...i })) as never;
  recipe.steps = input.steps.map((s) => ({ id: `recipe-step-${crypto.randomUUID()}`, ...s })) as never;
  recipe.tags = input.tags;
  await recipe.save();
  return { ok: true };
}

export async function deleteRecipe(id: string, accountId: string, memberId: string | null) {
  await requireAdultMember(memberId, accountId);
  const recipe = await findRecipeInAccount(id, accountId);
  recipe.deletedAt = new Date().toISOString();
  recipe.deletedBy = memberId;
  await recipe.save();
  return { ok: true };
}
