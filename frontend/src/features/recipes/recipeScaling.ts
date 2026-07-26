import type { Recipe, RecipeIngredient } from "@shared/types";

// Skalar en ingrediensmängd efter "Antal personer just nu" mot receptets
// egna sparade Antal personer (2026-07-26, Zaidas önskemål). Kräver BÅDA
// ingrediensens quantity OCH receptets servings satta — annars ingen bas
// att räkna från, ingrediensen visas bara som sitt namn (oförändrat).
export function scaledQuantity(
  ingredient: RecipeIngredient,
  recipeServings: Recipe["servings"],
  activeServings: number | null
): number | null {
  if (ingredient.quantity == null || !recipeServings || !activeServings) {
    return null;
  }
  return ingredient.quantity * (activeServings / recipeServings);
}

// Svensk decimaltecken (komma), avrundat till en decimal, heltal utan
// decimal ("750" inte "750,0"). Räkna om t.ex. 500g för 4 → 6 personer ger
// annars långa flyttal (750.00000000000001) som ser trasiga ut.
export function formatQuantity(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
}

// Hela ingrediensraden som den ska visas — skalad mängd (om möjligt) annars
// receptets ursprungliga mängd, annars bara namnet.
export function ingredientDisplayText(
  ingredient: RecipeIngredient,
  recipeServings: Recipe["servings"],
  activeServings: number | null
): string {
  const scaled = scaledQuantity(ingredient, recipeServings, activeServings);
  const amount = scaled ?? ingredient.quantity;
  if (amount == null) {
    return ingredient.text;
  }
  const parts = [formatQuantity(amount)];
  if (ingredient.unit) parts.push(ingredient.unit);
  parts.push(ingredient.text);
  return parts.join(" ");
}
