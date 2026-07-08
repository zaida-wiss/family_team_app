import type { Id, Member, RecurrenceRule, RecurrenceUnit, Todo, TodoCategory, TodoSubtask, Weekday } from "@shared/types";
import { WEEKDAY_SHORT } from "./recurringTodos";
import { generateId } from "../../utils/uuid";

// Import/export av todos via kalkylark (2026-07-05, Zaidas önskemål, utökad
// samma dag till att även täcka återkommelse — Zaida upptäckte att
// återkommande uppgifter tystnade helt ur exporten). En rad = en mall (för
// återkommande) eller en engångsuppgift. Flera tidsintervall per dag
// (Todo.timeWindows) täcks INTE — för komplext för en enda kalkylarksrad,
// måste läggas till separat via RecurrencePicker/TimeWindowsPicker efteråt.
export const TODO_CSV_HEADERS = [
  "Titel",
  "Emoji",
  "Tilldelad",
  "Egen kategori",
  "Stjärnor",
  "Timer",
  "Timer (min)",
  "Startdatum",
  "Slutdatum",
  "Återkommer",
  "Intervall",
  "Veckodagar",
  "Delmoment",
  "Anteckningar",
  "Id"
] as const;

const SELF_LABEL = "Mig själv";
const DEFAULT_EMOJI = "⭐";

const RECURRENCE_UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: "Dag",
  week: "Vecka",
  month: "Månad",
  year: "År"
};
const RECURRENCE_LABEL_TO_UNIT = new Map<string, RecurrenceUnit>(
  Object.entries(RECURRENCE_UNIT_LABEL).map(([unit, label]) => [label.toLowerCase(), unit as RecurrenceUnit])
);
const NONE_LABEL = "Nej";
const YES_LABEL = "Ja";

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
  const oneOff = ["Handla mat", "🛒", SELF_LABEL, "Hushåll", "", "", "", "", "", "", "", "", "", "Mjölk, bröd, ägg", ""];
  const recurring = ["Borsta tänderna", "🦷", SELF_LABEL, "", "", "", "", "2026-07-06 07:00", "", "Dag", "1", "", "", "", ""];
  return [toCsvRow([...TODO_CSV_HEADERS]), toCsvRow(oneOff), toCsvRow(recurring)].join("\r\n");
}

// Försvar mot ännu omigrerad produktionsdata (ADR-0015, 2026-07-05 CSV-fynd) —
// recurrence kan fortfarande ligga i den GAMLA "weekly"-formen (bara
// daysOfWeek, inget unit/every) i databasen om migrateRecurrenceRule.ts inte
// körts än. TS-typen tillåter inte detta längre, men databasen kan ändå
// innehålla det på runtime — utan detta blev exporten "Intervall: undefined"
// och tom "Återkommer" för alla ännu omigrerade återkommande uppgifter.
function formatRecurrenceForCsv(recurrence: RecurrenceRule): { unit: string; every: string; days: string } {
  if (recurrence.type === "none") {
    return { unit: "", every: "", days: "" };
  }
  const raw = recurrence as unknown as { unit?: RecurrenceUnit; every?: number; daysOfWeek?: Weekday[] | null };
  const unit: RecurrenceUnit = raw.unit ?? "week";
  const every = raw.every ?? 1;

  return {
    unit: RECURRENCE_UNIT_LABEL[unit],
    every: String(every),
    days: raw.daysOfWeek ? raw.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(",") : ""
  };
}

// "ÅÅÅÅ-MM-DD" eller "ÅÅÅÅ-MM-DD TT:MM" — tiden är valfri i indata (defaultar
// till dygnets start/slut), men skrivs alltid ut vid export (2026-07-05,
// Zaidas fynd: exporten visade bara datum, aldrig klockslag).
function dateTimeDisplayToISO(value: string, endOfDay: boolean): string | null {
  if (!value) return null;
  const [datePart, timePart] = value.trim().split(/\s+/, 2);
  if (!datePart) return null;
  const time = timePart ?? (endOfDay ? "23:59:00" : "00:00:00");
  const d = new Date(`${datePart}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isoToDateTimeDisplay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function subtasksToCsv(subtasks: TodoSubtask[] | undefined): string {
  if (!subtasks || subtasks.length === 0) return "";
  return subtasks.map((s) => s.title).join("; ");
}

function csvToSubtaskTitles(value: string): string[] {
  return value.split(";").map((s) => s.trim()).filter(Boolean);
}

export function todosToCsv(
  todos: Todo[],
  members: Member[],
  currentMemberId: Id,
  categories: TodoCategory[]
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
      todo.visual.value,
      assigneeLabel,
      categories.find((c) => c.id === todo.personalCategoryId)?.name ?? "",
      todo.starValue > 0 ? String(todo.starValue) : "",
      todo.timerEnabled ? YES_LABEL : "",
      todo.timerEnabled && todo.plannedDurationMinutes ? String(todo.plannedDurationMinutes) : "",
      // Lokala Date-getters (inte en rå ISO-sträng-slice, som läser UTC och
      // kan hamna en dag fel beroende på tidszon) — inkluderar nu klockslag,
      // inte bara datum (2026-07-05, Zaidas fynd).
      isoToDateTimeDisplay(todo.visibleFrom),
      isoToDateTimeDisplay(todo.expiresAt),
      unit,
      every,
      days,
      subtasksToCsv(todo.subtasks),
      todo.notes ?? "",
      todo.id
    ]);
  });

  return [toCsvRow([...TODO_CSV_HEADERS]), ...rows].join("\r\n");
}

export type ParsedTodoRow = {
  // Id från CSV:ns "Id"-kolumn — matchar mot en BEFINTLIG egen todo (2026-07-07,
  // Zaidas önskemål om att kunna uppdatera via export/import, inte bara skapa
  // nya). Matchar den inte något (saknas, tom mall-rad, eller okänt/annan
  // familjs id) skapas en helt ny todo istället, se TodoImportExport.tsx.
  sourceId: string | null;
  title: string;
  emoji: string;
  assignedTo: Id;
  // Satt när "Tilldelad" inte matchar någon medlem i KONTOT som importerar —
  // troligen en fil delad från en annan familj (2026-07-07, Zaidas resonemang).
  // TodoImportExport.tsx frågar importören vem i DERAS familj namnet menas,
  // innan raden faktiskt importeras.
  unresolvedAssigneeLabel: string | null;
  personalCategoryId: Id | null;
  newCategoryName: string | null;
  starValue: number;
  timerEnabled: boolean;
  plannedDurationMinutes: number | null;
  visibleFrom: string | null;
  expiresAt: string | null;
  recurrence: RecurrenceRule;
  subtasks: TodoSubtask[];
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

  const emojiCol = col("Emoji");
  const assignedCol = col("Tilldelad");
  const categoryCol = col("Egen kategori");
  const starsCol = col("Stjärnor");
  const timerCol = col("Timer");
  const timerMinutesCol = col("Timer (min)");
  const startCol = col("Startdatum");
  const endCol = col("Slutdatum");
  const recurrenceCol = col("Återkommer");
  const intervalCol = col("Intervall");
  const weekdaysCol = col("Veckodagar");
  const subtasksCol = col("Delmoment");
  const notesCol = col("Anteckningar");
  const idCol = col("Id");

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

    const emoji = (emojiCol !== undefined ? cells[emojiCol] : "")?.trim() || DEFAULT_EMOJI;

    const assignedLabel = (assignedCol !== undefined ? cells[assignedCol] : "")?.trim() ?? "";
    let assignedTo: Id = currentMemberId;
    let unresolvedAssigneeLabel: string | null = null;
    if (assignedLabel && assignedLabel.toLowerCase() !== SELF_LABEL.toLowerCase()) {
      const matches = members.filter(
        (m) => m.deletedAt === null && m.name.toLowerCase() === assignedLabel.toLowerCase()
      );
      if (matches.length === 1) {
        assignedTo = matches[0].id;
      } else if (matches.length > 1) {
        errors.push(`Rad ${rowNumber} ("${title}"): flera medlemmar heter "${assignedLabel}", hoppas över — döp om eller lämna tomt för dig själv.`);
        return;
      } else {
        // Okänt namn — troligen en fil importerad från en ANNAN familj (2026-07-07,
        // Zaidas resonemang kring att dela listor mellan familjer: "barnens namn
        // kan ju inte finnas med, då måste systemet fråga vem som skall tilldelas").
        // Raden hoppas INTE över — den flaggas som olöst, och TodoImportExport.tsx
        // frågar importören vilken av DERAS egna medlemmar namnet ska mappas till
        // (eller att hoppa över) innan importen fortsätter.
        unresolvedAssigneeLabel = assignedLabel;
      }
    }

    // En olöst rad är inte "jag själv" (den väntar på att mappas till en riktig
    // medlem, troligen ett barn) — annars skulle Stjärnor/Timer nollställas
    // innan mappningen ens gjorts.
    const isSelf = assignedTo === currentMemberId && !unresolvedAssigneeLabel;
    // Kategori gäller nu VILKEN mottagare som helst (2026-07-08, ADR-0020,
    // Zaidas beslut: "kategorierna kan vara samma, vi behöver ingen
    // rutinkategori, det räcker med kategori") — tidigare gällde det bara
    // Mig själv-rader.
    const categoryLabel = (categoryCol !== undefined ? cells[categoryCol] : "")?.trim() ?? "";
    let personalCategoryId: Id | null = null;
    let newCategoryName: string | null = null;
    if (categoryLabel) {
      const existing = categories.find((c) => c.name.toLowerCase() === categoryLabel.toLowerCase());
      if (existing) {
        personalCategoryId = existing.id;
      } else {
        newCategoryName = categoryLabel;
      }
    }

    const starsRaw = (starsCol !== undefined ? cells[starsCol] : "")?.trim() ?? "";
    const starValue = starsRaw ? Math.max(0, parseInt(starsRaw, 10) || 0) : 0;

    const timerRaw = (timerCol !== undefined ? cells[timerCol] : "")?.trim() ?? "";
    const timerEnabled = timerRaw.toLowerCase() === YES_LABEL.toLowerCase();

    const timerMinutesRaw = (timerMinutesCol !== undefined ? cells[timerMinutesCol] : "")?.trim() ?? "";
    const plannedDurationMinutes = timerMinutesRaw
      ? Math.max(1, Math.min(480, parseInt(timerMinutesRaw, 10) || 1))
      : null;

    const startRaw = (startCol !== undefined ? cells[startCol] : "")?.trim() ?? "";
    const endRaw = (endCol !== undefined ? cells[endCol] : "")?.trim() ?? "";
    const visibleFrom = dateTimeDisplayToISO(startRaw, false);
    const expiresAt = dateTimeDisplayToISO(endRaw, true);
    if (startRaw && !visibleFrom) {
      errors.push(`Rad ${rowNumber} ("${title}"): ogiltigt startdatum "${startRaw}" (vänta ÅÅÅÅ-MM-DD eller ÅÅÅÅ-MM-DD TT:MM), ignoreras.`);
    }
    if (endRaw && !expiresAt) {
      errors.push(`Rad ${rowNumber} ("${title}"): ogiltigt slutdatum "${endRaw}" (vänta ÅÅÅÅ-MM-DD eller ÅÅÅÅ-MM-DD TT:MM), ignoreras.`);
    }

    const recurrenceLabel = (recurrenceCol !== undefined ? cells[recurrenceCol] : "")?.trim() ?? "";
    let recurrence: RecurrenceRule = { type: "none" };
    if (recurrenceLabel && recurrenceLabel.toLowerCase() !== NONE_LABEL.toLowerCase()) {
      const unit = RECURRENCE_LABEL_TO_UNIT.get(recurrenceLabel.toLowerCase());
      if (!unit) {
        errors.push(
          `Rad ${rowNumber} ("${title}"): okänt värde "${recurrenceLabel}" i Återkommer (vänta Dag/Vecka/Månad/År/Nej), behandlas som engångsuppgift.`
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

    // En återkommande mall MÅSTE ha ett ankardatum (Startdatum) — utan det
    // kan förfallo-beräkningen (recurringTodos.ts) aldrig avgöra om mallen är
    // förfallen, exakt samma grundorsak som produktionsincidenten 2026-07-06
    // (se incidents/2026-07-06-barnens-rutiner-forsvann.md). Detta är EXTRA
    // viktigt vid en UPPDATERING (matchning via Id) — en tom Startdatum-cell
    // skulle annars tyst NOLLSTÄLLA en redan giltig ankardatum på en befintlig
    // mall. Hela raden hoppas över (skapas/uppdateras inte alls) hellre än att
    // spara en trasig mall, samma säkerhetsnivå som skapa-/redigera-modalens
    // egen spärr (isStartDateMissing).
    if (recurrence.type === "recurring" && !visibleFrom) {
      errors.push(
        `Rad ${rowNumber} ("${title}"): återkommande uppgifter kräver ett Startdatum (annars tappar mallen sitt ankardatum och slutar fungera) — raden hoppas över.`
      );
      return;
    }

    const subtasksRaw = (subtasksCol !== undefined ? cells[subtasksCol] : "")?.trim() ?? "";
    const subtasks: TodoSubtask[] = csvToSubtaskTitles(subtasksRaw).map((subtaskTitle) => ({
      id: `subtask-${generateId()}`,
      title: subtaskTitle,
      done: false
    }));

    const notes = (notesCol !== undefined ? cells[notesCol] : "")?.trim() || null;
    const sourceId = (idCol !== undefined ? cells[idCol] : "")?.trim() || null;

    rows.push({
      sourceId,
      title,
      emoji,
      assignedTo,
      unresolvedAssigneeLabel,
      personalCategoryId,
      newCategoryName,
      starValue: isSelf ? 0 : starValue,
      timerEnabled: isSelf ? false : timerEnabled,
      plannedDurationMinutes: isSelf ? null : plannedDurationMinutes,
      visibleFrom,
      expiresAt,
      recurrence,
      subtasks,
      notes
    });
  });

  return { rows, errors };
}
