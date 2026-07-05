import type { Id, Member, Todo, TodoCategory } from "@shared/types";
import { isoToDateOnly } from "./recurringTodos";

// Import/export av todos via kalkylark (2026-07-05, Zaidas önskemål). Bara
// engångsuppgifter (ingen återkommelse) — recurrence/veckodagar/intervall är
// för komplext att uttrycka i en enda kalkylarksrad, och täcks redan av
// RecurrencePicker i skapa/redigera-modalerna. En rad = en uppgift.
export const TODO_CSV_HEADERS = [
  "Titel",
  "Tilldelad",
  "Kategori",
  "Stjärnor",
  "Startdatum",
  "Slutdatum",
  "Anteckningar"
] as const;

const SELF_LABEL = "Mig själv";

// Minimal RFC4180-liknande CSV — undviker ett nytt beroende (CLAUDE.md-regel:
// nya beroenden kräver motivering) för ett format enkelt nog att skriva själv.
// Citerar ett fält om det innehåller kommatecken, citattecken eller radbrytning.
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Bort med ev. BOM från Excel-exporterade/öppnade filer.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  while (i < input.length) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function downloadCsv(filename: string, csv: string) {
  // UTF-8 BOM så Excel tolkar å/ä/ö rätt vid öppning.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildTemplateCsv(): string {
  const example = [
    "Handla mat",
    SELF_LABEL,
    "Hushåll",
    "",
    "",
    "",
    "Mjölk, bröd, ägg"
  ];
  return [toCsvRow([...TODO_CSV_HEADERS]), toCsvRow(example)].join("\r\n");
}

function dateOnlyToStartOfDayISO(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dateOnlyToEndOfDayISO(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function todosToCsv(
  todos: Todo[],
  members: Member[],
  currentMemberId: Id
): string {
  const exportable = todos.filter(
    (t) =>
      t.deletedAt === null &&
      t.recurringSourceId === null &&
      t.recurrence.type === "none" &&
      (t.assignedTo === currentMemberId || t.createdBy === currentMemberId)
  );

  const rows = exportable.map((todo) => {
    const assignee = members.find((m) => m.id === todo.assignedTo);
    const assigneeLabel = todo.assignedTo === currentMemberId ? SELF_LABEL : assignee?.name ?? "";
    return toCsvRow([
      todo.title,
      assigneeLabel,
      "", // Kategorinamnet slås inte upp här — kategorierna är memberId-scopade
          // och kräver att man matchar rätt ägares kategorilista; hoppas över
          // vid export för att undvika att peka på fel medlems kategori.
      todo.starValue > 0 ? String(todo.starValue) : "",
      // isoToDateOnly (samma hjälpare som RecurrencePicker/TodoEditModal
      // använder) — inte en rå .slice(0,10) på ISO-strängen, som skulle läsa
      // UTC-datumet och kunna hamna en dag fel beroende på tidszon.
      isoToDateOnly(todo.visibleFrom),
      isoToDateOnly(todo.expiresAt),
      todo.notes ?? ""
    ]);
  });

  return [toCsvRow([...TODO_CSV_HEADERS]), ...rows].join("\r\n");
}

export type ParsedTodoRow = {
  title: string;
  assignedTo: Id;
  personalCategoryId: Id | null;
  newCategoryName: string | null;
  starValue: number;
  visibleFrom: string | null;
  expiresAt: string | null;
  notes: string | null;
};

export type TodoCsvParseResult = {
  rows: ParsedTodoRow[];
  errors: string[];
};

// Matchar "Tilldelad"-kolumnen mot ett kontonamn (skiftlägesokänsligt) eller
// "Mig själv" — tvetydiga eller okända namn hoppas över med ett tydligt fel
// istället för att gissa fel person.
export function parseTodoCsv(
  text: string,
  members: Member[],
  categories: TodoCategory[],
  currentMemberId: Id
): TodoCsvParseResult {
  const table = parseCsvText(text);
  if (table.length === 0) {
    return { rows: [], errors: ["Filen är tom."] };
  }

  const [headerRow, ...dataRows] = table;
  const headerIndex = new Map(headerRow.map((h, i) => [h.trim().toLowerCase(), i]));
  const col = (name: string) => headerIndex.get(name.toLowerCase());
  const titleCol = col("Titel");

  if (titleCol === undefined) {
    return { rows: [], errors: [`Saknar kolumnen "Titel" — ladda ner mallen och jämför rubrikraden.`] };
  }

  const assignedCol = col("Tilldelad");
  const categoryCol = col("Kategori");
  const starsCol = col("Stjärnor");
  const startCol = col("Startdatum");
  const endCol = col("Slutdatum");
  const notesCol = col("Anteckningar");

  const rows: ParsedTodoRow[] = [];
  const errors: string[] = [];

  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2; // +1 rubrikrad, +1 för 1-indexerat radnummer i kalkylarket
    const title = (cells[titleCol] ?? "").trim();
    if (!title) {
      if (cells.every((c) => c.trim() === "")) return; // tom rad, hoppa tyst
      errors.push(`Rad ${rowNumber}: saknar en titel, hoppas över.`);
      return;
    }

    const assignedLabel = (assignedCol !== undefined ? cells[assignedCol] : "")?.trim() ?? "";
    let assignedTo: Id = currentMemberId;
    if (assignedLabel && assignedLabel.toLowerCase() !== SELF_LABEL.toLowerCase()) {
      const matches = members.filter(
        (m) => m.deletedAt === null && m.name.toLowerCase() === assignedLabel.toLowerCase()
      );
      if (matches.length === 0) {
        errors.push(`Rad ${rowNumber} ("${title}"): hittar ingen medlem som heter "${assignedLabel}", hoppas över.`);
        return;
      }
      if (matches.length > 1) {
        errors.push(`Rad ${rowNumber} ("${title}"): flera medlemmar heter "${assignedLabel}", hoppas över — döp om eller lämna tomt för dig själv.`);
        return;
      }
      assignedTo = matches[0].id;
    }

    const isSelf = assignedTo === currentMemberId;
    const categoryLabel = (categoryCol !== undefined ? cells[categoryCol] : "")?.trim() ?? "";
    let personalCategoryId: Id | null = null;
    let newCategoryName: string | null = null;
    if (isSelf && categoryLabel) {
      const existing = categories.find((c) => c.name.toLowerCase() === categoryLabel.toLowerCase());
      if (existing) {
        personalCategoryId = existing.id;
      } else {
        newCategoryName = categoryLabel;
      }
    }

    const starsRaw = (starsCol !== undefined ? cells[starsCol] : "")?.trim() ?? "";
    const starValue = starsRaw ? Math.max(0, parseInt(starsRaw, 10) || 0) : 0;

    const startRaw = (startCol !== undefined ? cells[startCol] : "")?.trim() ?? "";
    const endRaw = (endCol !== undefined ? cells[endCol] : "")?.trim() ?? "";
    const visibleFrom = dateOnlyToStartOfDayISO(startRaw);
    const expiresAt = dateOnlyToEndOfDayISO(endRaw);
    if (startRaw && !visibleFrom) {
      errors.push(`Rad ${rowNumber} ("${title}"): ogiltigt startdatum "${startRaw}" (vänta ÅÅÅÅ-MM-DD), ignoreras.`);
    }
    if (endRaw && !expiresAt) {
      errors.push(`Rad ${rowNumber} ("${title}"): ogiltigt slutdatum "${endRaw}" (vänta ÅÅÅÅ-MM-DD), ignoreras.`);
    }

    const notes = (notesCol !== undefined ? cells[notesCol] : "")?.trim() || null;

    rows.push({
      title,
      assignedTo,
      personalCategoryId,
      newCategoryName,
      starValue: isSelf ? 0 : starValue,
      visibleFrom,
      expiresAt,
      notes
    });
  });

  return { rows, errors };
}
