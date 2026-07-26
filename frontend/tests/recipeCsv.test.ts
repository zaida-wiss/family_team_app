import { describe, expect, it } from "vitest";
import { parseRecipeCsv, recipesToCsv } from "../src/features/recipes/recipeCsv";
import type { Recipe } from "@shared/types";

// Mängd/enhet i CSV (2026-07-26, Zaidas önskemål: "sen måste vi fixa mängd
// och enheter") — textToIngredient/ingredientToText har en heuristik (ett
// inledande tal + ett KÄNT enhetsord) för att skilja "500 g köttfärs" (mängd
// 500, enhet g, namn köttfärs) från "3 ägg" (mängd 3, INGEN enhet, namn ägg)
// utan att gissa fel och sluka första ordet av namnet.

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe-1",
    accountId: "acc-1",
    name: "Köttfärssås",
    emoji: null,
    imageUrl: null,
    sourceUrl: null,
    servings: 4,
    ingredients: [],
    steps: [{ id: "step-1", text: "Fräs", timedMinutes: null }],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "mem-1",
    deletedAt: null,
    deletedBy: null,
    ...overrides
  };
}

describe("parseRecipeCsv: mängd/enhet-tolkning", () => {
  it("tolkar 'mängd enhet namn' korrekt när enheten är känd", () => {
    const csv = "Namn,Emoji,Länk,Antal personer,Taggar,Ingredienser,Steg,Id\r\n" +
      "Test,,,,,\"500 g köttfärs\",Steg 1,\r\n";
    const [row] = parseRecipeCsv(csv);
    expect(row.ingredients).toEqual([{ text: "köttfärs", quantity: 500, unit: "g" }]);
  });

  it("tolkar 'mängd namn' utan enhet ('3 ägg') utan att sluka första ordet av namnet", () => {
    const csv = "Namn,Emoji,Länk,Antal personer,Taggar,Ingredienser,Steg,Id\r\n" +
      "Test,,,,,\"3 ägg\",Steg 1,\r\n";
    const [row] = parseRecipeCsv(csv);
    expect(row.ingredients).toEqual([{ text: "ägg", quantity: 3, unit: null }]);
  });

  it("tolkar decimaltal med komma", () => {
    const csv = "Namn,Emoji,Länk,Antal personer,Taggar,Ingredienser,Steg,Id\r\n" +
      "Test,,,,,\"1,5 dl grädde\",Steg 1,\r\n";
    const [row] = parseRecipeCsv(csv);
    expect(row.ingredients).toEqual([{ text: "grädde", quantity: 1.5, unit: "dl" }]);
  });

  it("en rad utan inledande tal blir bara namn, ingen mängd (t.ex. 'Salt efter smak')", () => {
    const csv = "Namn,Emoji,Länk,Antal personer,Taggar,Ingredienser,Steg,Id\r\n" +
      "Test,,,,,\"Salt efter smak\",Steg 1,\r\n";
    const [row] = parseRecipeCsv(csv);
    expect(row.ingredients).toEqual([{ text: "Salt efter smak", quantity: null, unit: null }]);
  });
});

describe("recipesToCsv → parseRecipeCsv: rundtrip", () => {
  it("mängd+enhet överlever export och import", () => {
    const r = recipe({
      ingredients: [
        { id: "ing-1", text: "köttfärs", quantity: 500, unit: "g" },
        { id: "ing-2", text: "ägg", quantity: 3, unit: null },
        { id: "ing-3", text: "Salt efter smak", quantity: null, unit: null }
      ]
    });
    const csv = recipesToCsv([r]);
    const [row] = parseRecipeCsv(csv);
    expect(row.ingredients).toEqual([
      { text: "köttfärs", quantity: 500, unit: "g" },
      { text: "ägg", quantity: 3, unit: null },
      { text: "Salt efter smak", quantity: null, unit: null }
    ]);
  });
});
