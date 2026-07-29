import type { Id, Member, TimedTaskWithBest } from "@shared/types";
import { csvField, downloadCsv, parseCsvText, toCsvRow } from "../todos/todoCsv";

// Import/export av Medaljer/Rekord-uppgifter via kalkylark (2026-07-29, del
// av Zaidas önskemål "all data ska gå att importera och exportera i de
// olika kategorierna i inställningar") — samma minimala RFC4180-parser som
// resten av appen redan skrivit, återanvänd rakt av. En rad = en tidtagen
// uppgift (bara SJÄLVA UPPGIFTEN — titel/ikon/vilket barn; de faktiska
// tidtagna FÖRSÖKEN/rekorden är en egen historik som inte går att
// importera/exportera, samma "definitionen är CSV-bar, historiken stannar
// i appen"-princip som redan gäller Belöningsbutikens köphistorik). Ingen
// "Id"-kolumn — till skillnad från todos/recept/belöningar finns ingen
// uppdatera-funktion för TimedTask (bara skapa/ta bort), så import kan bara
// SKAPA nya, aldrig uppdatera en befintlig.
export const TIMED_TASK_CSV_HEADERS = ["Titel", "Emoji", "Barn"] as const;

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const DEFAULT_SYMBOL = "🏃";

export function buildTimedTaskTemplateCsv(): string {
  const header = toCsvRow([...TIMED_TASK_CSV_HEADERS]);
  const example = toCsvRow(["Spring ett varv", "🏃", "Nova"]);
  return `${header}\n${example}\n`;
}

export function timedTasksToCsv(tasks: TimedTaskWithBest[], children: Member[]): string {
  const rows = tasks
    .filter((t) => t.deletedAt === null)
    .map((t) => toCsvRow([t.title, t.symbol ?? "", children.find((c) => c.id === t.assignedTo)?.name ?? ""]));
  return `${toCsvRow([...TIMED_TASK_CSV_HEADERS])}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}

export type ParsedTimedTaskRow = {
  title: string;
  symbol: string | null;
  childName: string;
};

export function parseTimedTaskCsv(text: string): { rows: ParsedTimedTaskRow[]; errors: string[] } {
  const lines = parseCsvText(text);
  if (lines.length === 0) return { rows: [], errors: [] };

  const header = lines[0].map((h) => h.trim());
  const colIndex = (name: string) => header.indexOf(name);
  const titleIdx = colIndex("Titel");
  const emojiIdx = colIndex("Emoji");
  const childIdx = colIndex("Barn");

  const rows: ParsedTimedTaskRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.every((c) => c.trim() === "")) continue;
    const rowNum = i + 1;

    const title = (titleIdx !== -1 ? cells[titleIdx] : "").trim();
    if (!title) {
      errors.push(`Rad ${rowNum}: Titel saknas, hoppar över.`);
      continue;
    }

    const childName = (childIdx !== -1 ? cells[childIdx] : "").trim();
    if (!childName) {
      errors.push(`Rad ${rowNum} ("${title}"): Barn saknas, hoppar över.`);
      continue;
    }

    const rawEmoji = (emojiIdx !== -1 ? cells[emojiIdx] : "").trim();
    const symbol = rawEmoji && EMOJI_PATTERN.test(rawEmoji) ? rawEmoji : null;

    rows.push({ title, symbol, childName });
  }

  return { rows, errors };
}

// Matchar Barn-cellens fria namn mot ett riktigt barn i kontot
// (skiftlägesokänsligt) — TimedTask.assignedTo måste alltid vara ett
// befintligt barn, ingen "Familjen"/"Mig själv"-motsvarighet finns för
// tidtagna uppgifter.
export function resolveChildId(childName: string, children: Member[]): Id | null {
  return children.find((c) => c.name.toLowerCase() === childName.toLowerCase())?.id ?? null;
}

export { downloadCsv, csvField, DEFAULT_SYMBOL };
