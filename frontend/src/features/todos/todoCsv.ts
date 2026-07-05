import type { Id, Member, RecurrenceRule, RecurrenceUnit, Todo, TodoCategory, Weekday } from "@shared/types";
import { isoToDateOnly, WEEKDAY_SHORT } from "./recurringTodos";

// Import/export av todos via kalkylark (2026-07-05, Zaidas önskemål, utökad
// samma dag till att även täcka återkommelse — Zaida upptäckte att
// återkommande uppgifter tystnade helt ur exporten). En rad = en mall (för
// återkommande) eller en engångsuppgift. Flera tidsintervall per dag
// (Todo.timeWindows) täcks INTE — för komplext för en enda kalkylarksrad,
// måste läggas till separat via RecurrencePicker/TimeWindowsPicker efteråt.
export const TODO_CSV_HEADERS = [
  "Titel",
  "Tilldelad",
  "Kategori",
  "Stjärnor",
  "Startdatum",
  "Slutdatum",
  "Återkommer",
  "Intervall",
  "Veckodagar",
  "Anteckningar"
] as const;

const SELF_LABEL = "Mig själv";

const RECURRENCE_UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: "Dag",
  week: "Vecka",
  month: "Månad"
};
const RECURRENCE_LABEL_TO_UNIT = new Map<string, RecurrenceUnit>(
  Object.entries(RECURRENCE_UNIT_LABEL).map(([unit, label]) => [label.toLowerCase(), unit as RecurrenceUnit])
);
const NONE_LABEL = "Nej";

const WEEKDAY_SHORT_TO_KEY = new Map<string, Weekday>(
  (Object.entries(WEEKDAY_SHORT) as Array<[Weekday, string]>).map(([weekday, short]) => [short.toLowerCase(), weekday])
);

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
  const oneOff = ["Handla mat", SELF_LABEL, "Hushåll", "", "", "", "", "", "", "Mjölk, bröd, ägg"];
  const recurring = ["Borsta tänderna", SELF_LABEL, "", "", "2026-07-06", "", "Dag", "1", "", ""];
  return [toCsvRow([...TODO_CSV_HEADERS]), toCsvRow(oneOff), toCsvRow(recurring)].join("\r\n");
}

function formatRecurrenceForCsv(recurrence: RecurrenceRule): { unit: string; every: string; days: string } {
  if (recurrence.type === "none") {
    return { unit: "", every: "", days: "" };
  }
  return {
    unit: RECURRENCE_UNIT_LABEL[recurrence.unit],
    every: String(recurrence.every),
    days: recurrence.daysOfWeek ? recurrence.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(",") : ""
  };
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
  // Återkommande MALLAR exporteras (recurringSourceId === null) — dagens
  // redan genererade occurrences (recurringSourceId satt) exporteras inte,
  // de är bara en frusen daglig kopia av mallen, inte något att importera.
  const exportable = todos.filter(
    (t) =>
      t.deletedAt === null &&
      t.recurringSourceId === null &&
      (t.assignedTo === currentMemberId || t.createdBy === currentMemberId)
  );

  const rows = exportable.map((todo) => {
    const assignee = members.find((m) => m.id === todo.assignedTo);
    const assigneeLabel = todo.assignedTo === currentMemberId ? SELF_LABEL : assignee?.name ?? "";
    const { unit, every, days } = formatRecurrenceForCsv(todo.recurrence);
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
      unit,
      every,
      days,
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
  recurrence: RecurrenceRule;
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
  const recurrenceCol = col("Återkommer");
  const intervalCol = col("Intervall");
  const weekdaysCol = col("Veckodagar");
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

    const recurrenceLabel = (recurrenceCol !== undefined ? cells[recurrenceCol] : "")?.trim() ?? "";
    let recurrence: RecurrenceRule = { type: "none" };
    if (recurrenceLabel && recurrenceLabel.toLowerCase() !== NONE_LABEL.toLowerCase()) {
      const unit = RECURRENCE_LABEL_TO_UNIT.get(recurrenceLabel.toLowerCase());
      if (!unit) {
        errors.push(
          `Rad ${rowNumber} ("${title}"): okänt värde "${recurrenceLabel}" i Återkommer (vänta Dag/Vecka/Månad/Nej), behandlas som engångsuppgift.`
        );
      } else {
        const intervalRaw = (intervalCol !== undefined ? cells[intervalCol] : "")?.trim() ?? "";
        const every = intervalRaw ? Math.max(1, parseInt(intervalRaw, 10) || 1) : 1;

        let daysOfWeek: Weekday[] | null = null;
        if (unit === "week") {
          const weekdaysRaw = (weekdaysCol !== undefined ? cells[weekdaysCol] : "")?.trim() ?? "";
          const labels = weekdaysRaw.split(",").map((s) => s.trim()).filter(Boolean);
          const parsedDays = labels
            .map((label) => WEEKDAY_SHORT_TO_KEY.get(label.toLowerCase()))
            .filter((d): d is Weekday => d !== undefined);
          if (parsedDays.length === 0) {
            errors.push(
              `Rad ${rowNumber} ("${title}"): återkommelse "Vecka" kräver minst en giltig veckodag i Veckodagar (mån,tis,ons,tors,fre,lör,sön), behandlas som engångsuppgift.`
            );
          } else {
            daysOfWeek = parsedDays;
          }
        }

        if (unit !== "week" || daysOfWeek) {
          recurrence = { type: "recurring", unit, every, daysOfWeek };
        }
      }
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
      recurrence,
      notes
    });
  });

  return { rows, errors };
}
