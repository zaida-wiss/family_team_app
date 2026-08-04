import type {
  Id, Member, RecurrenceEnd, RecurrenceRule, RecurrenceUnit, Todo, TodoCategory, TodoSubtask, TodoTimeWindow, Weekday
} from "@shared/types";
import { WEEKDAY_SHORT, dateOnlyToISO } from "./recurringTodos";
import { generateId } from "../../utils/uuid";

// Import/export av todos via kalkylark (2026-07-05, Zaidas önskemål, utökad
// samma dag till att även täcka återkommelse — Zaida upptäckte att
// återkommande uppgifter tystnade helt ur exporten). En rad = en mall (för
// återkommande) eller en engångsuppgift.
//
// 2026-08-03 utökad med "Fler tidsrutor" (Todo.timeWindows, tidigare uttryckligen
// UTESLUTEN som "för komplext för en enda kalkylarksrad") och "Slutar"
// (RecurrenceEnd/ADR-0017, tidigare inte alls representerad i CSV) — Zaidas
// exakta önskemål: tidsbegränsade återkommande uppgifter (synlig kl. X,
// försvinner kl. Y om ogjord, nästa dags kopia oberoende) ska gå att sätta
// upp HELT från kalkylark, inte bara via appens UI efteråt.
//
// 2026-08-04 tillagd "Radera" (Zaidas önskemål: "ladda ner alla todos,
// uppdatera, lägga till nya och radera de jag inte vill ha kvar längre,
// sedan importera") — samma "Ja"-värde som Timer-kolumnen redan använder.
// Kräver ett ifyllt Id (annars finns inget att radera) — se parseTodoCsv.
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
  "Fler tidsrutor",
  "Återkommer",
  "Intervall",
  "Veckodagar",
  "Slutar",
  "Delmoment",
  "Anteckningar",
  "Id",
  "Radera"
] as const;

// "HH:MM-HH:MM, HH:MM-HH:MM, ..." — ytterligare tidsrutor UTÖVER den första
// (som redan täcks av Startdatum/Slutdatum), alla på SAMMA ankardag som
// Startdatum. Matchar TimeWindowsPicker.tsx:s "Från kl./Till kl."-par, bara
// hoprullat till en enda cell istället för flera UI-rader.
const TIME_RANGE_PATTERN = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/;

const SELF_LABEL = "Mig själv";
// Familjen-tilldelning (2026-08-03, assignedTo:null) — samma etikett som
// getAssigneeName (selectors.ts) redan använder i UI:t.
const FAMILY_LABEL = "Familjen";
const DEFAULT_EMOJI = "⭐";
// Ett kalkylark ger ingen garanti att "Emoji"-cellen faktiskt innehåller en
// emoji — ett vanligt misstag är att skriva ett ord (t.ex. "gympa") i
// cellen istället, eller att spreadsheet-programmet gör om en inklistrad
// emoji till text. Utan den här kontrollen sparades vad som helst rakt av
// som Todo.visual.value, vilket visar sig som bokstäver istället för en
// symbol i barnens vy (Zaidas fynd 2026-07-26) — matchar inte något
// pictografiskt Unicode-tecken faller cellen tillbaka på DEFAULT_EMOJI.
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

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
export function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvRow(fields: string[]): string {
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
  const oneOff =
    ["Handla mat", "🛒", SELF_LABEL, "Hushåll", "", "", "", "", "", "", "", "", "", "", "", "Mjölk, bröd, ägg", "", ""];
  // Enkel återkommande, en tidsruta per dag (synlig kl./försvinner kl.) —
  // det vanligaste fallet, ingen "Fler tidsrutor" eller "Slutar" behövs.
  const recurringSimple =
    ["Andningsövning", "🧘", SELF_LABEL, "", "", "", "", "2026-08-04 10:00", "2026-08-04 10:30", "", "Dag", "1", "", "", "", "", "", ""];
  // Flera tidsrutor på SAMMA mall (morgon OCH kväll) — Startdatum/Slutdatum
  // är den FÖRSTA rutan, "Fler tidsrutor" lägger till resten (samma ankardag).
  const recurringMultiWindow =
    ["Borsta tänderna", "🦷", SELF_LABEL, "", "", "", "", "2026-08-04 07:00", "2026-08-04 07:15", "19:00-19:15", "Dag", "1", "", "", "", "", "", ""];
  // Slutar efter ett visst antal gånger (eller sätt ett datum i ÅÅÅÅ-MM-DD).
  const recurringWithEnd =
    ["Öva piano", "🎹", SELF_LABEL, "", "", "", "", "2026-08-04 17:00", "2026-08-04 17:20", "", "Dag", "1", "", "30", "", "", "", ""];
  // Radera (2026-08-04) — kräver ett riktigt Id från en tidigare export, en
  // helt ny rad utan Id kan aldrig raderas (det finns inget att matcha mot).
  // Den här exempelraden fungerar alltså bara som illustration i just mallen,
  // inte i en faktisk import — vid en RIKTIG radering fyller man i "Ja" på en
  // rad man redan hämtat via "Exportera mina uppgifter", med det Id:t kvar.
  const deleteExample =
    ["Gammal uppgift (exempel)", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "todo-x-från-en-export", "Ja"];
  return [
    toCsvRow([...TODO_CSV_HEADERS]),
    toCsvRow(oneOff),
    toCsvRow(recurringSimple),
    toCsvRow(recurringMultiWindow),
    toCsvRow(recurringWithEnd),
    toCsvRow(deleteExample)
  ].join("\r\n");
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

function isoToTimeOnlyDisplay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Ytterligare tidsrutor UTÖVER den första (2026-08-03) — todo.timeWindows[0]
// motsvarar redan Startdatum/Slutdatum, resten skrivs ut här som
// "HH:MM-HH:MM"-par, kommaseparerade. Ankardagen (datumdelen) är alltid
// samma som Startdatum, bara klockslagen skiljer sig mellan rutorna.
function formatExtraTimeWindows(windows: TodoTimeWindow[] | undefined): string {
  if (!windows || windows.length < 2) return "";
  return windows
    .slice(1)
    .map((w) => `${isoToTimeOnlyDisplay(w.visibleFrom)}-${isoToTimeOnlyDisplay(w.expiresAt)}`)
    .join(", ");
}

// Bygger extra TodoTimeWindow-objekt från en "Fler tidsrutor"-cell, alla
// förlagda till SAMMA ankardag (dateKey, "ÅÅÅÅ-MM-DD") som Startdatum.
//
// firstWindowRange (2026-08-04, Zaidas fynd — se incidents-dokumentet för
// samma dag): en "Fler tidsrutor"-cell som råkar UPPREPA exakt samma
// klockslag som Startdatum/Slutdatum (t.ex. av misstag när en extern
// AI-assistent skrev om filen) genererade tidigare TVÅ IDENTISKA occurrences
// för samma dag och tidsfönster — syntes i appen som en till synes
// duplicerad boll. En exakt duplicerad tidsruta (mot första rutan ELLER mot
// en annan "Fler tidsrutor"-cell på samma rad) hoppas nu över med ett
// tydligt fel istället för att tyst skapa dubblerade occurrences.
function parseExtraTimeWindows(
  value: string,
  dateKey: string,
  rowNumber: number,
  title: string,
  errors: string[],
  firstWindowRange: string | null
): TodoTimeWindow[] {
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  const windows: TodoTimeWindow[] = [];
  const seenRanges = new Set<string>(firstWindowRange ? [firstWindowRange] : []);
  for (const part of parts) {
    const match = TIME_RANGE_PATTERN.exec(part);
    if (!match) {
      errors.push(
        `Rad ${rowNumber} ("${title}"): ogiltig tidsruta "${part}" i Fler tidsrutor (vänta TT:MM-TT:MM), hoppas över.`
      );
      continue;
    }
    if (seenRanges.has(part)) {
      errors.push(
        `Rad ${rowNumber} ("${title}"): tidsrutan "${part}" i Fler tidsrutor är samma som en redan befintlig tidsruta (Startdatum/Slutdatum eller en tidigare "Fler tidsrutor"-ruta), hoppas över för att undvika dubbletter.`
      );
      continue;
    }
    seenRanges.add(part);
    windows.push({
      visibleFrom: dateTimeDisplayToISO(`${dateKey} ${match[1]}`, false),
      expiresAt: dateTimeDisplayToISO(`${dateKey} ${match[2]}`, true)
    });
  }
  return windows;
}

// RecurrenceEnd/ADR-0017 (2026-08-03) — "Aldrig"/tom cell, ett datum
// (ÅÅÅÅ-MM-DD, samma format som RecurrencePicker.tsx:s <input type="date">)
// eller ett heltal ("efter N gånger"). Samma smarta typdetektering som
// Återkommer redan gör för enhet — en kalkylarksrad ska inte behöva en
// separat "typ"-kolumn för det här.
function formatRecurrenceEnd(end: RecurrenceEnd | undefined): string {
  if (!end || end.type === "never") return "";
  if (end.type === "until") return end.date;
  return String(end.count);
}

function parseRecurrenceEnd(value: string, rowNumber: number, title: string, errors: string[]): RecurrenceEnd | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { type: "until", date: trimmed };
  }
  if (/^\d+$/.test(trimmed)) {
    const count = Math.max(1, parseInt(trimmed, 10));
    return { type: "count", count };
  }
  errors.push(
    `Rad ${rowNumber} ("${title}"): okänt värde "${trimmed}" i Slutar (vänta ett datum ÅÅÅÅ-MM-DD eller ett antal gånger), tolkas som "aldrig".`
  );
  return undefined;
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
  // Ingen egen assignedTo/createdBy-filtrering här (borttagen 2026-08-03) —
  // BÅDA anropsställena (ParentTodoThreadView.tsx:s per-kategori-export,
  // TodoImportExport.tsx:s kryssrutebaserade export) skickar redan in en
  // FÄRDIGFILTRERAD lista. Den gamla interna filtreringen var av misstag för
  // snäv för familje-scope (en familje-uppgift skapad av NÅGON ANNAN
  // försvann tyst ur "Utan kategori"-exporten, trots ikryssad kryssruta).
  const exportable = todos.filter((t) => t.deletedAt === null && t.recurringSourceId === null);

  const rows = exportable.map((todo) => {
    const assignee = members.find((m) => m.id === todo.assignedTo);
    const assigneeLabel =
      todo.assignedTo === null ? FAMILY_LABEL : todo.assignedTo === currentMemberId ? SELF_LABEL : assignee?.name ?? "";
    const { unit, every, days } = formatRecurrenceForCsv(todo.recurrence);
    // Har mallen flera tidsrutor (2026-08-03, Todo.timeWindows) bär
    // Startdatum/Slutdatum den FÖRSTA rutan (todo.visibleFrom/expiresAt är då
    // bara ett datum-ankare + null, se TodoCreatorModal.tsx) — "Fler
    // tidsrutor" bär resten.
    const firstWindow = todo.timeWindows?.[0];
    const end = todo.recurrence.type === "recurring" ? todo.recurrence.end : undefined;
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
      isoToDateTimeDisplay(firstWindow ? firstWindow.visibleFrom : todo.visibleFrom),
      isoToDateTimeDisplay(firstWindow ? firstWindow.expiresAt : todo.expiresAt),
      formatExtraTimeWindows(todo.timeWindows),
      unit,
      every,
      days,
      formatRecurrenceEnd(end),
      subtasksToCsv(todo.subtasks),
      todo.notes ?? "",
      todo.id,
      // Aldrig förifylld vid export — en radering är alltid ett aktivt val
      // importören gör i kalkylarket efteråt, inte något exporten gissar.
      ""
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
  // Id vid en vanlig import (default: importören själv), null vid en
  // familje-import (default: Familjen, 2026-08-03) — se defaultAssignee-
  // parametern nedan.
  assignedTo: Id | null;
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
  // Fler tidsrutor UTÖVER Startdatum/Slutdatum (2026-08-03, Todo.timeWindows)
  // — bara satt när "Fler tidsrutor"-cellen faktiskt innehöll något giltigt.
  // undefined = engångsuppgift/enkel återkommelse, oförändrat beteende.
  timeWindows: TodoTimeWindow[] | undefined;
  subtasks: TodoSubtask[];
  notes: string | null;
  // Radera-kolumnen ikryssad ("Ja", 2026-08-04) — kräver ett matchande Id
  // (sourceId), TodoImportExport.tsx raderar den befintliga todon istället
  // för att skapa/uppdatera. Övriga fält på raden är då oanvända defaults,
  // aldrig lästa.
  deleteRow: boolean;
};

export type TodoCsvParseResult = {
  rows: ParsedTodoRow[];
  errors: string[];
};

// Matchar "Tilldelad"-kolumnen mot ett kontonamn (skiftlägesokänsligt), "Mig
// själv" eller "Familjen" — tvetydiga eller okända namn hoppas inte över,
// utan flaggas som olösta (TodoImportExport.tsx frågar importören).
// defaultAssignee (2026-08-03) styr vad en TOM cell betyder — importörens
// eget id vid en vanlig import (oförändrat), null (Familjen) vid en
// familje-import, se TodoImportExport.tsx:s scope-prop.
export function parseTodoCsv(
  text: string,
  members: Member[],
  categories: TodoCategory[],
  currentMemberId: Id,
  defaultAssignee: Id | null = currentMemberId
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
  const extraWindowsCol = col("Fler tidsrutor");
  const recurrenceCol = col("Återkommer");
  const intervalCol = col("Intervall");
  const weekdaysCol = col("Veckodagar");
  const recurrenceEndCol = col("Slutar");
  const subtasksCol = col("Delmoment");
  const notesCol = col("Anteckningar");
  const idCol = col("Id");
  const deleteCol = col("Radera");

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

    const sourceId = (idCol !== undefined ? cells[idCol] : "")?.trim() || null;

    // Radera (2026-08-04, Zaidas önskemål: "ladda ner alla todos, uppdatera,
    // lägga till nya och radera de jag inte vill ha kvar längre, sedan
    // importera") — kort-slutar hela raden HÄR, ingen av de övriga
    // kolumnerna (kategori/datum/återkommelse/delmoment osv) tolkas eller
    // valideras, de är irrelevanta för en radering och skulle bara kunna ge
    // missvisande fel på en rad som ändå ska bort. Kräver ett Id — utan ett
    // sådant finns ingen befintlig todo att matcha mot och radera.
    const deleteRaw = (deleteCol !== undefined ? cells[deleteCol] : "")?.trim() ?? "";
    if (deleteRaw.toLowerCase() === YES_LABEL.toLowerCase()) {
      if (!sourceId) {
        errors.push(`Rad ${rowNumber} ("${title}"): Radera är ikryssad men raden saknar ett Id, ingenting kan raderas.`);
        return;
      }
      rows.push({
        sourceId,
        title,
        emoji: DEFAULT_EMOJI,
        assignedTo: null,
        unresolvedAssigneeLabel: null,
        personalCategoryId: null,
        newCategoryName: null,
        starValue: 0,
        timerEnabled: false,
        plannedDurationMinutes: null,
        visibleFrom: null,
        expiresAt: null,
        recurrence: { type: "none" },
        timeWindows: undefined,
        subtasks: [],
        notes: null,
        deleteRow: true
      });
      return;
    }

    const emojiRaw = (emojiCol !== undefined ? cells[emojiCol] : "")?.trim() ?? "";
    const emoji = emojiRaw && EMOJI_PATTERN.test(emojiRaw) ? emojiRaw : DEFAULT_EMOJI;

    const assignedLabel = (assignedCol !== undefined ? cells[assignedCol] : "")?.trim() ?? "";
    let assignedTo: Id | null = defaultAssignee;
    let unresolvedAssigneeLabel: string | null = null;
    if (assignedLabel && assignedLabel.toLowerCase() === FAMILY_LABEL.toLowerCase()) {
      assignedTo = null;
    } else if (assignedLabel && assignedLabel.toLowerCase() !== SELF_LABEL.toLowerCase()) {
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

    // En olöst rad är inte "jag själv"/"Familjen" (den väntar på att mappas
    // till en riktig medlem, troligen ett barn) — annars skulle Stjärnor/
    // Timer nollställas innan mappningen ens gjorts. En familje-uppgift
    // (assignedTo: null) nollställs av samma anledning som "mig själv" —
    // ingen specifik mottagare att belöna med stjärnor.
    const isSelf = (assignedTo === currentMemberId || assignedTo === null) && !unresolvedAssigneeLabel;
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

    // Slutar (2026-08-03, ADR-0017/RecurrenceEnd) — bara meningsfullt för en
    // återkommande rad, ignoreras tyst annars (samma "irrelevant för den här
    // radtypen"-hållning som Stjärnor/Timer redan har för icke-Mig-själv-rader).
    const recurrenceEndRaw = (recurrenceEndCol !== undefined ? cells[recurrenceEndCol] : "")?.trim() ?? "";
    if (recurrenceEndRaw && recurrence.type === "recurring") {
      const end = parseRecurrenceEnd(recurrenceEndRaw, rowNumber, title, errors);
      if (end) {
        recurrence = { ...recurrence, end };
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

    // Fler tidsrutor (2026-08-03, Todo.timeWindows) — bara meningsfullt på en
    // återkommande mall (samma regel som shared/types.ts:s egen kommentar).
    // Startdatum/Slutdatum blir tidsrutan[0], cellens värden läggs till som
    // resten, alla förlagda till Startdatums ankardag. Todo.visibleFrom/
    // expiresAt byggs sedan om till bara ett datum-ankare + null (matchar
    // exakt hur TodoCreatorModal.tsx redan bygger en recurring+timeWindows-
    // uppgift, se dess kommentar "de faktiska klockslagen kommer från
    // timeWindows").
    const extraWindowsRaw = (extraWindowsCol !== undefined ? cells[extraWindowsCol] : "")?.trim() ?? "";
    let timeWindows: TodoTimeWindow[] | undefined;
    let finalVisibleFrom = visibleFrom;
    let finalExpiresAt = expiresAt;
    if (extraWindowsRaw) {
      if (recurrence.type !== "recurring") {
        errors.push(
          `Rad ${rowNumber} ("${title}"): Fler tidsrutor gäller bara återkommande uppgifter (Återkommer), ignoreras för en engångsuppgift.`
        );
      } else {
        const anchorDateKey = startRaw.split(/\s+/, 1)[0];
        const firstWindowRange =
          visibleFrom && expiresAt ? `${isoToTimeOnlyDisplay(visibleFrom)}-${isoToTimeOnlyDisplay(expiresAt)}` : null;
        const extraWindows = parseExtraTimeWindows(extraWindowsRaw, anchorDateKey, rowNumber, title, errors, firstWindowRange);
        if (extraWindows.length > 0) {
          timeWindows = [{ visibleFrom, expiresAt }, ...extraWindows];
          finalVisibleFrom = dateOnlyToISO(anchorDateKey);
          finalExpiresAt = null;
        }
      }
    }

    const subtasksRaw = (subtasksCol !== undefined ? cells[subtasksCol] : "")?.trim() ?? "";
    const subtasks: TodoSubtask[] = csvToSubtaskTitles(subtasksRaw).map((subtaskTitle) => ({
      id: `subtask-${generateId()}`,
      title: subtaskTitle,
      done: false
    }));

    const notes = (notesCol !== undefined ? cells[notesCol] : "")?.trim() || null;

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
      visibleFrom: finalVisibleFrom,
      expiresAt: finalExpiresAt,
      recurrence,
      timeWindows,
      subtasks,
      notes,
      deleteRow: false
    });
  });

  return { rows, errors };
}
