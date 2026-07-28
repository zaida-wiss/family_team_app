import { toCsvRow, parseCsvText } from "../todos/todoCsv";
import type { ShoppingList } from "@shared/types";

// Import/export av inköpslistor via kalkylark (2026-07-28, Zaidas önskemål:
// "all data ska alltid gå att importera och exportera i de olika
// kategorierna i inställningar") — samma minimala RFC4180-parser som redan
// finns i todoCsv.ts (csvField/toCsvRow/parseCsvText), återanvänd rakt av
// istället för en tredje egen kopia (samma mönster som recipeCsv.ts redan
// följde). En rad = en vara. Ingen Id-kolumn/uppdatera-befintlig-stöd (till
// skillnad från todos/recept) — medvetet enklare v1, en inköpslista har
// ingen meningsfull "samma vara igen"-identitet att matcha mot.
export const SHOPPING_CSV_HEADERS = ["Lista", "Vara", "Klar"] as const;

const YES_LABEL = "Ja";
const NO_LABEL = "Nej";

export function buildShoppingTemplateCsv(): string {
  return [
    toCsvRow([...SHOPPING_CSV_HEADERS]),
    toCsvRow(["Veckohandling", "Mjölk", NO_LABEL]),
    toCsvRow(["Veckohandling", "Ägg", YES_LABEL])
  ].join("\n");
}

export function shoppingListsToCsv(lists: ShoppingList[]): string {
  const rows = [toCsvRow([...SHOPPING_CSV_HEADERS])];
  for (const list of lists) {
    if (list.deletedAt !== null) continue;
    for (const item of list.items) {
      if (item.deletedAt !== null) continue;
      rows.push(toCsvRow([list.name, item.title, item.done ? YES_LABEL : NO_LABEL]));
    }
  }
  return rows.join("\n");
}

export type ParsedShoppingRow = {
  listName: string;
  title: string;
  done: boolean;
};

export function parseShoppingCsv(text: string): { rows: ParsedShoppingRow[]; errors: string[] } {
  const allRows = parseCsvText(text);
  if (allRows.length === 0) return { rows: [], errors: [] };

  const header = allRows[0].map((h) => h.trim());
  const listIdx = header.indexOf("Lista");
  const titleIdx = header.indexOf("Vara");
  const doneIdx = header.indexOf("Klar");

  const rows: ParsedShoppingRow[] = [];
  const errors: string[] = [];
  for (let i = 1; i < allRows.length; i++) {
    const cells = allRows[i];
    const listName = (cells[listIdx] ?? "").trim();
    const title = (cells[titleIdx] ?? "").trim();
    if (!listName || !title) {
      errors.push(`Rad ${i + 1}: Lista och Vara krävs — raden hoppades över.`);
      continue;
    }
    rows.push({
      listName,
      title,
      done: (cells[doneIdx] ?? "").trim().toLowerCase() === YES_LABEL.toLowerCase()
    });
  }
  return { rows, errors };
}
