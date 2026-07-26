import { useEffect, useState } from "react";
import { recipesApi, reportApiError } from "../../api";
import { readCache, writeCache } from "../../utils/localCache";
import type { Id, Recipe } from "@shared/types";

const RECIPES_CACHE_KEY = "recipes_v1";

type RecipeInput = {
  name: string;
  emoji: string | null;
  // Valfritt (till skillnad från RecipeFormModal.tsx:s RecipeFormInput, som
  // alltid skickar det) — CSV-importens ParsedRecipeRow har ingen bildkolumn
  // (ett foto laddas alltid upp manuellt), backend defaultar saknat till null.
  imageUrl?: string | null;
  sourceUrl?: string | null;
  tags: string[];
  ingredients: { text: string }[];
  steps: { text: string; timedMinutes: number | null }[];
};

// Recept (2026-07-25, ADR-0028) — kontobrett, samma stale-while-revalidate-
// mönster som useTodoCategoriesState.ts.
export function useRecipesState() {
  const [recipes, setRecipes] = useState<Recipe[]>(() => readCache(RECIPES_CACHE_KEY, []));

  useEffect(() => {
    recipesApi.getAll().then(setRecipes).catch(console.error);
  }, []);

  useEffect(() => {
    writeCache(RECIPES_CACHE_KEY, recipes);
  }, [recipes]);

  // Fångar och visar fel (2026-07-26, Zaidas fynd: "inget händer heller när
  // jag ska spara recept") — createRecipe hade ingen egen felhantering alls,
  // ett misslyckat anrop (t.ex. Recept ännu inte deployat till produktion,
  // eller ett riktigt nätverksfel) gav en tyst avvisad Promise: skapa-modalen
  // stängdes ändå direkt (onSave-anroparen väntar inte in resultatet), utan
  // att receptet någonsin lades till och utan att något felmeddelande syntes.
  function createRecipe(input: RecipeInput) {
    return recipesApi.create(input).then(
      (recipe) => {
        setRecipes((current) => [...current, recipe]);
        return recipe;
      },
      (err) => {
        reportApiError("Receptet kunde inte sparas");
        throw err;
      }
    );
  }

  function updateRecipe(id: Id, input: RecipeInput) {
    recipesApi.update(id, input).catch(() => reportApiError("Receptet kunde inte sparas"));
    setRecipes((current) =>
      current.map((r) => (r.id !== id ? r : { ...r, ...input, ingredients: r.ingredients, steps: r.steps }))
    );
    // Servern genererar nya id:n för ingredienser/steg vid varje uppdatering
    // (se recipesService.ts) — enklast att hämta om istället för att gissa
    // dem klientsidan.
    recipesApi.getAll().then(setRecipes).catch(console.error);
  }

  function removeRecipe(id: Id) {
    recipesApi.remove(id).catch(() => reportApiError("Receptet kunde inte raderas"));
    setRecipes((current) => current.filter((r) => r.id !== id));
  }

  // Massimport (2026-07-25, Zaidas önskemål: "exportera och importera
  // recept, massuppladdning") — en rad utan Id skapar ett nytt recept, en
  // rad vars Id matchar ett BEFINTLIGT eget recept uppdaterar det istället
  // (samma matcha-mot-Id-mönster som todoCsv.ts:s import). Buntar i grupper
  // om 4 med en kort paus (ADR-0023, 2026-07-16 rate-limit-incidenten) —
  // samma skäl/mönster som Sprint 8 S9:s fix av todo-importens loop.
  async function importRecipes(rows: (RecipeInput & { id?: Id | null })[]) {
    const existingIds = new Set(recipes.map((r) => r.id));
    for (let i = 0; i < rows.length; i += 4) {
      const batch = rows.slice(i, i + 4);
      await Promise.all(
        batch.map(({ id, ...input }) =>
          id && existingIds.has(id) ? recipesApi.update(id, input) : recipesApi.create(input)
        )
      );
      if (i + 4 < rows.length) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const fresh = await recipesApi.getAll();
    setRecipes(fresh);
  }

  return { recipes, createRecipe, updateRecipe, removeRecipe, importRecipes };
}
