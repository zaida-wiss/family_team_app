import type { Recipe, RecipeIngredient } from "@shared/types";
import { downloadCsv, parseCsvText, toCsvRow } from "../todos/todoCsv";
import { generateId } from "../../utils/uuid";
import { formatQuantity } from "./recipeScaling";

// Import/export av recept via kalkylark (2026-07-25, Zaidas önskemål:
// "kunna exportera och importera recept (massuppladdning)") — samma
// minimala RFC4180-liknande CSV-primitiver som todoCsv.ts redan skrev
// (parseCsvText/csvField/toCsvRow, återanvända rakt av — inget nytt
// beroende, ingen duplicerad parser). Ingredienser/steg är listor inom EN
// cell, separerade med " | " (enkelt att läsa/redigera i ett kalkylark),
// ett tidsstyrt steg skrivs "Text (25 min)".

export const RECIPE_CSV_HEADERS = ["Namn", "Emoji", "Länk", "Antal personer", "Taggar", "Ingredienser", "Steg", "Id"] as const;

const ITEM_SEPARATOR = " | ";
const TIMED_STEP_PATTERN = /^(.*)\((\d+)\s*min\)$/;

// Mängd/enhet i CSV (2026-07-26, Zaidas önskemål) — en ingrediensrad
// skrivs "500 g köttfärs"/"3 ägg"/"Salt efter smak". Vid import: ett
// inledande tal tolkas som mängd, ordet direkt efter som enhet BARA om det
// finns i denna lista (annars vore "3 ägg" felaktigt tolkat som mängd 3 +
// enhet "ägg" + tomt namn) — resten av raden blir alltid namnet.
const KNOWN_UNITS = new Set([
  "g", "gram", "kg", "hg", "dl", "cl", "ml", "l", "liter",
  "msk", "tsk", "st", "styck", "förp", "förpackning", "paket",
  "burk", "burkar", "skiva", "skivor", "klyfta", "klyftor",
  "nypa", "kruka", "knippe", "port", "portion", "portioner", "påse"
]);

function stepToText(step: Recipe["steps"][number]): string {
  return step.timedMinutes != null ? `${step.text} (${step.timedMinutes} min)` : step.text;
}

function textToStep(raw: string): { text: string; timedMinutes: number | null } {
  const match = raw.trim().match(TIMED_STEP_PATTERN);
  if (match) {
    return { text: match[1].trim(), timedMinutes: Math.max(1, Math.floor(Number(match[2]))) };
  }
  return { text: raw.trim(), timedMinutes: null };
}

function ingredientToText(ingredient: RecipeIngredient): string {
  if (ingredient.quantity == null) return ingredient.text;
  const amount = formatQuantity(ingredient.quantity);
  return ingredient.unit ? `${amount} ${ingredient.unit} ${ingredient.text}` : `${amount} ${ingredient.text}`;
}

function textToIngredient(raw: string): { text: string; quantity: number | null; unit: string | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
  if (!match) return { text: trimmed, quantity: null, unit: null };
  const quantity = Number(match[1].replace(",", "."));
  const rest = match[2].trim();
  const words = rest.split(/\s+/);
  const firstWord = (words[0] ?? "").toLowerCase().replace(/[.,]/g, "");
  if (firstWord && KNOWN_UNITS.has(firstWord) && words.length > 1) {
    return { text: words.slice(1).join(" "), quantity, unit: words[0] };
  }
  return { text: rest, quantity, unit: null };
}

export function recipesToCsv(recipes: Recipe[]): string {
  const rows = recipes.map((r) => [
    r.name,
    r.emoji ?? "",
    r.sourceUrl ?? "",
    r.servings != null ? String(r.servings) : "",
    r.tags.join(", "),
    r.ingredients.map(ingredientToText).join(ITEM_SEPARATOR),
    r.steps.map(stepToText).join(ITEM_SEPARATOR),
    r.id
  ]);
  return [toCsvRow([...RECIPE_CSV_HEADERS]), ...rows.map(toCsvRow)].join("\r\n");
}

export function buildRecipeTemplateCsv(): string {
  const example = [
    "Köttfärssås", "🍝", "https://exempel.se/kottfarssas", "4", "vardag, snabbt",
    ["500 g köttfärs", "1 burk krossade tomater", "1 gul lök"].join(ITEM_SEPARATOR),
    ["Fräs köttfärsen och löken", "Sätt in i ugnen (25 min)"].join(ITEM_SEPARATOR),
    ""
  ];
  return [toCsvRow([...RECIPE_CSV_HEADERS]), toCsvRow(example)].join("\r\n");
}

export { downloadCsv };

export type ParsedRecipeRow = {
  id: string | null;
  name: string;
  emoji: string | null;
  sourceUrl: string | null;
  servings: number | null;
  tags: string[];
  ingredients: { text: string; quantity: number | null; unit: string | null }[];
  steps: { text: string; timedMinutes: number | null }[];
};

// Returnerar bara giltiga rader — en rad utan namn hoppas tyst över (samma
// "var förlåtande, ignorera trasiga rader"-princip som todoCsv.ts).
export function parseRecipeCsv(text: string): ParsedRecipeRow[] {
  const rows = parseCsvText(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const colIndex = (label: string) => header.indexOf(label);
  const nameIdx = colIndex("Namn");
  const emojiIdx = colIndex("Emoji");
  const sourceUrlIdx = colIndex("Länk");
  const servingsIdx = colIndex("Antal personer");
  const tagsIdx = colIndex("Taggar");
  const ingredientsIdx = colIndex("Ingredienser");
  const stepsIdx = colIndex("Steg");
  const idIdx = colIndex("Id");

  return rows.slice(1)
    .map((row) => {
      const name = (row[nameIdx] ?? "").trim();
      if (!name) return null;
      const ingredientsRaw = row[ingredientsIdx] ?? "";
      const stepsRaw = row[stepsIdx] ?? "";
      const servingsRaw = (row[servingsIdx] ?? "").trim();
      const servingsNum = Number(servingsRaw);
      return {
        id: (row[idIdx] ?? "").trim() || null,
        name,
        emoji: (row[emojiIdx] ?? "").trim() || null,
        sourceUrl: (row[sourceUrlIdx] ?? "").trim() || null,
        servings: servingsRaw && Number.isFinite(servingsNum) && servingsNum > 0 ? Math.floor(servingsNum) : null,
        tags: (row[tagsIdx] ?? "").split(",").map((t) => t.trim()).filter(Boolean),
        ingredients: ingredientsRaw.split(ITEM_SEPARATOR).map((t) => t.trim()).filter(Boolean).map(textToIngredient),
        steps: stepsRaw.split(ITEM_SEPARATOR).map((t) => t.trim()).filter(Boolean).map(textToStep)
      };
    })
    .filter((r): r is ParsedRecipeRow => r !== null);
}

// Bara för att generera ett unikt filnamn vid export — inte kopplat till
// receptets egna id:n.
export function recipeExportFilename(): string {
  return `recept-${generateId().slice(0, 8)}.csv`;
}
