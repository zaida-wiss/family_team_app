import { describe, expect, it } from "vitest";
import { formatQuantity, ingredientDisplayText, scaledQuantity } from "../src/features/recipes/recipeScaling";
import type { RecipeIngredient } from "@shared/types";

function ingredient(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { id: "ing-1", text: "köttfärs", quantity: 500, unit: "g", ...overrides };
}

describe("scaledQuantity", () => {
  it("skalar upp proportionellt mot receptets servings", () => {
    expect(scaledQuantity(ingredient({ quantity: 500 }), 4, 8)).toBe(1000);
  });

  it("skalar ner proportionellt", () => {
    expect(scaledQuantity(ingredient({ quantity: 4 }), 4, 2)).toBe(2);
  });

  it("returnerar null om ingrediensen saknar quantity (t.ex. 'Salt efter smak')", () => {
    expect(scaledQuantity(ingredient({ quantity: null }), 4, 8)).toBeNull();
  });

  it("returnerar null om receptet saknar servings (ingen bas att räkna från)", () => {
    expect(scaledQuantity(ingredient({ quantity: 500 }), null, 8)).toBeNull();
  });

  it("returnerar null om ingen 'just nu'-räknare är satt", () => {
    expect(scaledQuantity(ingredient({ quantity: 500 }), 4, null)).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("visar heltal utan decimal", () => {
    expect(formatQuantity(750)).toBe("750");
  });

  it("avrundar till en decimal med svenskt decimaltecken", () => {
    expect(formatQuantity(500 * (6 / 4))).toBe("750");
    expect(formatQuantity(1 * (5 / 3))).toBe("1,7");
  });
});

describe("ingredientDisplayText", () => {
  it("visar skalad mängd + enhet + namn när allt finns", () => {
    expect(ingredientDisplayText(ingredient({ quantity: 500, unit: "g" }), 4, 8)).toBe("1000 g köttfärs");
  });

  it("visar receptets ursprungliga mängd om ingen 'just nu'-räknare är satt", () => {
    expect(ingredientDisplayText(ingredient({ quantity: 500, unit: "g" }), 4, null)).toBe("500 g köttfärs");
  });

  it("visar bara namnet när ingrediensen saknar quantity (gammalt recept eller 'efter smak')", () => {
    expect(ingredientDisplayText(ingredient({ text: "500 g köttfärs", quantity: null, unit: null }), 4, 8)).toBe(
      "500 g köttfärs"
    );
  });

  it("visar mängd + namn utan enhet när enhet saknas (t.ex. '3 ägg')", () => {
    expect(ingredientDisplayText(ingredient({ text: "ägg", quantity: 3, unit: null }), 4, 8)).toBe("6 ägg");
  });
});
