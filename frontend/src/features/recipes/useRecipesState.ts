import { useEffect, useState } from "react";
import { recipesApi } from "../../api";
import { readCache, writeCache } from "../../utils/localCache";
import type { Id, Recipe } from "@shared/types";

const RECIPES_CACHE_KEY = "recipes_v1";

type RecipeInput = {
  name: string;
  emoji: string | null;
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

  function createRecipe(input: RecipeInput) {
    return recipesApi.create(input).then((recipe) => {
      setRecipes((current) => [...current, recipe]);
      return recipe;
    });
  }

  function updateRecipe(id: Id, input: RecipeInput) {
    recipesApi.update(id, input).catch(console.error);
    setRecipes((current) =>
      current.map((r) => (r.id !== id ? r : { ...r, ...input, ingredients: r.ingredients, steps: r.steps }))
    );
    // Servern genererar nya id:n för ingredienser/steg vid varje uppdatering
    // (se recipesService.ts) — enklast att hämta om istället för att gissa
    // dem klientsidan.
    recipesApi.getAll().then(setRecipes).catch(console.error);
  }

  function removeRecipe(id: Id) {
    recipesApi.remove(id).catch(console.error);
    setRecipes((current) => current.filter((r) => r.id !== id));
  }

  return { recipes, createRecipe, updateRecipe, removeRecipe };
}
