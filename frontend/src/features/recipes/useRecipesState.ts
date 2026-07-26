import { useEffect, useState } from "react";
import { recipesApi } from "../../api";
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
  servings?: number | null;
  tags: string[];
  ingredients: { text: string; quantity: number | null; unit: string | null }[];
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
  // jag ska spara recept", senare "det fungerar inte att radera recept").
  // Ingen egen reportApiError-anrop här längre — client.ts:s performRequest/
  // handleResponse visar REDAN serverns riktiga felmeddelande (t.ex. "Recept
  // hittades inte"/"Åtkomst nekad") via samma globala felbanner. Ett eget
  // andra, generiskt reportApiError-anrop i en .catch() här SKREV ÖVER det
  // riktiga meddelandet (bannern är bara en enda apiError-sträng,
  // useAppState.ts) — gömde exakt den information som hade behövts för att
  // felsöka "fungerar inte"-rapporterna. Anropen väntar nu även in svaret
  // innan lokal state ändras (var tidigare fire-and-glöm) — ett misslyckat
  // anrop lämnar då receptet OFÖRÄNDRAT lokalt istället för att optimistiskt
  // se ut att fungera och sedan tyst dyka upp igen vid nästa hämtning.
  function createRecipe(input: RecipeInput) {
    return recipesApi.create(input).then((recipe) => {
      setRecipes((current) => [...current, recipe]);
      return recipe;
    });
  }

  function updateRecipe(id: Id, input: RecipeInput) {
    // Servern genererar nya id:n för ingredienser/steg vid varje uppdatering
    // (se recipesService.ts) — hämtar om istället för att gissa dem
    // klientsidan. Väntar in update() FÖRE getAll() (var tidigare parallellt,
    // en race där getAll() kunde hinna svara med gammal data innan
    // uppdateringen ens landat server-side och skriva över en optimistisk
    // lokal ändring — kunde se ut som att "inget händer" vid Spara).
    return recipesApi.update(id, input).then(() => recipesApi.getAll()).then(setRecipes);
  }

  function removeRecipe(id: Id) {
    return recipesApi.remove(id).then(() => {
      setRecipes((current) => current.filter((r) => r.id !== id));
    });
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
