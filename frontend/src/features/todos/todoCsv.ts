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
//
// 2026-08-05 tillagda "Skapad"/"Ändrad" (Zaidas önskemål) — RENT INFORMATIVA,
// serverstyrda revisionsstämplar (Todo.createdAt/updatedAt). Läses ALDRIG av
// parseTodoCsv (ingen col()-uppslagning för dem alls, se längre ner) — precis
// som vilken okänd extra-kolumn som helst ignoreras de tyst vid import, ett
// klistrat-in värde där kan alltså aldrig påverka en skapad/uppdaterad todo.
// Kolumnordning (2026-08-09, Zaidas önskemål: "för att det skall gå lättare
// att göra nya uppgifter") — de fält man fyller i FÖRST när man skapar en ny
// uppgift för hand (Emoji/Titel/Egen kategori/Delmoment/Anteckningar) ligger
// nu överst i mallen, sedan tidsstyrning (Stjärnor→Slutar), och de fält man
// sällan rör själv (Familj/Tilldelad/Id/Skapad/Ändrad/Radera) längst ner.
// Importen (parseTodoCsv) slår upp varje kolumn via NAMNET i filens EGEN
// rubrikrad (headerIndex, se längre ner) — helt oberoende av vilken ordning
// de råkar stå i, så en redan exporterad äldre fil med den GAMLA ordningen
// fortsätter importeras korrekt. Exportens/mallens radbyggare (rowFromFields
// nedan) läser likaså av namn, inte position — en omordning av bara DENNA
// array räcker alltså, ingen annan kod behöver röras.
export const TODO_CSV_HEADERS = [
  "Emoji",
  "Titel",
  "Egen kategori",
  "Delmoment",
  "Anteckningar",
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
  // Familj (2026-08-06, Zaidas önskemål: "gör det tydligare i mallen och
  // import och export vilken familj uppgiften tillhör. Om det står tomt
  // där så tillhör den kontoinnehavaren själv") — en tom cell betyder alltid
  // ditt eget konto (den enda möjligheten för en rad du själv importerar),
  // en ifylld cell (bara förekommande på exporterade rader från "Andra
  // familjer" — Mina familjekonton/Familjeanslutningar) visar VILKEN annan
  // familj raden hör till. UPPDATERAD 2026-08-08 (Zaidas önskemål: "om det
  // står en familj jag är med i... då innebär det att den inte skall vara
  // min egen todo, utan just den familjens todo") — till skillnad från
  // Skapad/Ändrad LÄSER parseTodoCsv numera denna kolumn (se familyCol/
  // targetFamily nedan): en ifylld cell som matchar ett känt familjekonto
  // routar hela raden dit istället för till importörens eget konto.
  "Familj",
  "Tilldelad",
  "Id",
  "Skapad",
  "Ändrad",
  "Radera"
] as const;

type TodoCsvHeader = (typeof TODO_CSV_HEADERS)[number];

// Bygger den faktiska raden i RÄTT kolumnordning från ett namngivet
// fält-objekt (2026-08-09) — ersätter tidigare positionella arrayer, där en
// framtida omordning av TODO_CSV_HEADERS hade krävt att räkna om index i
// FLERA separata arrayer utan att TypeScript kunde varna för ett missat
// fält. `Record<TodoCsvHeader, string>` tvingar fram att ALLA kolumner
// anges (saknas en ger TypeScript ett kompileringsfel, inte en tyst
// förskjuten cell).
function rowFromFields(fields: Record<TodoCsvHeader, string>): string {
  return toCsvRow(TODO_CSV_HEADERS.map((h) => fields[h]));
}

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

// Dagens datum, ÅÅÅÅ-MM-DD — mallens exempelrader räknas ut relativt IDAG
// istället för ett hårdkodat, med tiden allt äldre datum (2026-08-06,
// Zaidas önskemål: "gör om mallen så att vi ser hur man fyller i uppgifter
// som skall bli kvar och uppgifter som skall försvinna från vyn efter en
// viss tid... och timer") — annars ser en nedladdad mall snabbt ut som att
// allt redan hunnit gå ut.
function todayDateOnly(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Gemensam bas — alla kolumner tomma som standard, varje exempelrad nedan
// skriver bara över de fält den faktiskt vill illustrera (2026-08-09,
// samma "namngivna fält istället för positionella arrayer"-omläggning som
// rowFromFields ovan — en framtida ny kolumn i TODO_CSV_HEADERS ger annars
// ett kompileringsfel här tills den läggs till, istället för att tyst
// förskjuta alla celler i en hårdkodad array).
function blankRow(): Record<TodoCsvHeader, string> {
  const row = {} as Record<TodoCsvHeader, string>;
  for (const h of TODO_CSV_HEADERS) row[h] = "";
  return row;
}

export function buildTemplateCsv(): string {
  const today = todayDateOnly();
  // 1) Blir kvar tills den bockas av — INGA datum alls (Startdatum/
  //    Slutdatum tomma). En engångsuppgift utan datum försvinner aldrig av
  //    sig själv, oavsett hur länge den ligger okvitterad.
  const staysUntilDone: Record<TodoCsvHeader, string> = {
    ...blankRow(),
    Titel: "Handla mat", Emoji: "🛒", Tilldelad: SELF_LABEL, "Egen kategori": "Hushåll",
    Anteckningar: "Mjölk, bröd, ägg"
  };
  // 2) Försvinner ur vyn efter en viss tid — en engångsuppgift (INGEN
  //    återkommelse) med ett satt Slutdatum. Syns från Startdatum, försvinner
  //    (räknas som utgången) vid Slutdatum om den inte hunnit avklaras.
  const expiresAfterDeadline: Record<TodoCsvHeader, string> = {
    ...blankRow(),
    Titel: "Hämta paket", Emoji: "📦", Tilldelad: SELF_LABEL, "Egen kategori": "Ärenden",
    Startdatum: `${today} 08:00`, Slutdatum: `${today} 20:00`,
    Anteckningar: "Utlämningsstället stänger 20:00"
  };
  // 3) Återkommande, enkel — en tidsruta per dag (synlig kl./försvinner kl.),
  //    det vanligaste fallet. Ingen "Fler tidsrutor" eller "Slutar" behövs.
  const recurringSimple: Record<TodoCsvHeader, string> = {
    ...blankRow(),
    Titel: "Andningsövning", Emoji: "🧘", Tilldelad: SELF_LABEL,
    Startdatum: `${today} 10:00`, Slutdatum: `${today} 10:30`, Återkommer: "Dag", Intervall: "1"
  };
  // 4) Återkommande med FLERA tidsrutor på SAMMA mall (morgon OCH kväll) —
  //    Startdatum/Slutdatum är den FÖRSTA rutan, "Fler tidsrutor" lägger
  //    till resten (samma ankardag, "TT:MM-TT:MM" per extra ruta).
  const recurringMultiWindow: Record<TodoCsvHeader, string> = {
    ...blankRow(),
    Titel: "Borsta tänderna", Emoji: "🦷", Tilldelad: SELF_LABEL,
    Startdatum: `${today} 07:00`, Slutdatum: `${today} 07:15`, "Fler tidsrutor": "19:00-19:15",
    Återkommer: "Dag", Intervall: "1"
  };
  // 5) Återkommande med ett SLUTVILLKOR — antingen ett antal gånger (som
  //    här, "30") eller ett slutdatum (ÅÅÅÅ-MM-DD) i "Slutar"-kolumnen.
  const recurringWithEnd: Record<TodoCsvHeader, string> = {
    ...blankRow(),
    Titel: "Öva piano", Emoji: "🎹", Tilldelad: SELF_LABEL,
    Startdatum: `${today} 17:00`, Slutdatum: `${today} 17:20`, Återkommer: "Dag", Intervall: "1",
    Slutar: "30"
  };
  // 6) Tidtagning — "Timer: Ja" + "Timer (min)" (1–480) ger barnet en
  //    nedräkning på uppdragskortet istället för en vanlig Starta/Klar-
  //    tidtagning. Fungerar för både engångs- och återkommande uppgifter
  //    (denna är ett engångsexempel, för att hålla raden enkel).
  const withTimer: Record<TodoCsvHeader, string> = {
    ...blankRow(),
    Titel: "Städa rummet", Emoji: "🧹", Tilldelad: SELF_LABEL, "Egen kategori": "Hushåll",
    Stjärnor: "3", Timer: YES_LABEL, "Timer (min)": "25"
  };
  // Radera (2026-08-04) — kräver ett riktigt Id från en tidigare export, en
  // helt ny rad utan Id kan aldrig raderas (det finns inget att matcha mot).
  // Den här exempelraden fungerar alltså bara som illustration i just mallen,
  // inte i en faktisk import — vid en RIKTIG radering fyller man i "Ja" på en
  // rad man redan hämtat via "Exportera mina uppgifter", med det Id:t kvar.
  // "Skapad"/"Ändrad" (2026-08-05) tomma i mallen — de finns bara på riktiga,
  // redan exporterade rader, en ny mall-rad har ingen historik än.
  const deleteExample: Record<TodoCsvHeader, string> = {
    ...blankRow(),
    Titel: "Gammal uppgift (exempel)", Id: "todo-x-från-en-export", Radera: "Ja"
  };
  // 8) Familj (2026-08-06) — bara förekommande på RIKTIGA exporterade rader
  //    från "Andra familjer" (Mina familjekonton/Familjeanslutningar), ren
  //    information. En tom cell (som alla ovanstående exempel) betyder alltid
  //    ditt eget konto — det är det enda en NY rad du själv fyller i kan bli.
  const otherFamilyExample: Record<TodoCsvHeader, string> = {
    ...blankRow(),
    Titel: "Handla present (exempel, hör till en annan familj)", Emoji: "🎁", Tilldelad: FAMILY_LABEL,
    Anteckningar: "Bara till information — importen läser aldrig denna kolumn.",
    Familj: "Familjen Andersson"
  };
  return [
    toCsvRow([...TODO_CSV_HEADERS]),
    rowFromFields(staysUntilDone),
    rowFromFields(expiresAfterDeadline),
    rowFromFields(recurringSimple),
    rowFromFields(recurringMultiWindow),
    rowFromFields(recurringWithEnd),
    rowFromFields(withTimer),
    rowFromFields(deleteExample),
    rowFromFields(otherFamilyExample)
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

// En rad från "Andra familjer" (Mina familjekonton/Familjeanslutningar,
// TodoImportExport.tsx:s otherFamilies) — samma Todo-form, men
// categoryNames slås upp mot DEN FAMILJENS egna kategorier, inte mina.
type OtherFamilyTodos = {
  accountName: string;
  todos: Todo[];
  categoryNames?: Record<Id, string>;
};

function buildTodoCsvRow(
  todo: Todo,
  members: Member[],
  currentMemberId: Id,
  categoryName: string,
  familyName: string
): string {
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
  return rowFromFields({
    Titel: todo.title,
    Emoji: todo.visual.value,
    Tilldelad: assigneeLabel,
    "Egen kategori": categoryName,
    Stjärnor: todo.starValue > 0 ? String(todo.starValue) : "",
    Timer: todo.timerEnabled ? YES_LABEL : "",
    "Timer (min)": todo.timerEnabled && todo.plannedDurationMinutes ? String(todo.plannedDurationMinutes) : "",
    // Lokala Date-getters (inte en rå ISO-sträng-slice, som läser UTC och
    // kan hamna en dag fel beroende på tidszon) — inkluderar nu klockslag,
    // inte bara datum (2026-07-05, Zaidas fynd).
    Startdatum: isoToDateTimeDisplay(firstWindow ? firstWindow.visibleFrom : todo.visibleFrom),
    Slutdatum: isoToDateTimeDisplay(firstWindow ? firstWindow.expiresAt : todo.expiresAt),
    "Fler tidsrutor": formatExtraTimeWindows(todo.timeWindows),
    Återkommer: unit,
    Intervall: every,
    Veckodagar: days,
    Slutar: formatRecurrenceEnd(end),
    Delmoment: subtasksToCsv(todo.subtasks),
    Anteckningar: todo.notes ?? "",
    Id: todo.id,
    // Serverstyrda, rent informativa (2026-08-05) — saknas de (redan
    // existerande, ej ommigrerade todos) blir cellen bara tom, ingen krasch.
    Skapad: isoToDateTimeDisplay(todo.createdAt ?? null),
    Ändrad: isoToDateTimeDisplay(todo.updatedAt ?? null),
    // Aldrig förifylld vid export — en radering är alltid ett aktivt val
    // importören gör i kalkylarket efteråt, inte något exporten gissar.
    Radera: "",
    // Familj (2026-08-06) — tom för mina egna, kontonamnet för en rad från
    // "Andra familjer" (se TODO_CSV_HEADERS-kommentaren).
    Familj: familyName
  });
}

export function todosToCsv(
  todos: Todo[],
  members: Member[],
  currentMemberId: Id,
  categories: TodoCategory[],
  otherFamilies?: OtherFamilyTodos[]
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
  const rows = exportable.map((todo) =>
    buildTodoCsvRow(todo, members, currentMemberId, categories.find((c) => c.id === todo.personalCategoryId)?.name ?? "", "")
  );

  // Andra familjer (2026-08-06) — bara med om anroparen skickar med dem
  // (TodoImportExport.tsx:s redan hämtade otherFamilies, "Andra familjer"-
  // sektionen). Rent informativt tillägg i EXPORTEN, ingen ny import-väg.
  const otherRows = (otherFamilies ?? []).flatMap((family) =>
    family.todos
      .filter((t) => t.deletedAt === null && t.recurringSourceId === null)
      .map((todo) =>
        buildTodoCsvRow(
          todo,
          members,
          currentMemberId,
          (todo.personalCategoryId && family.categoryNames?.[todo.personalCategoryId]) || "",
          family.accountName
        )
      )
  );

  return [toCsvRow([...TODO_CSV_HEADERS]), ...rows, ...otherRows].join("\r\n");
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
  // Familj-kolumnen matchade en känd ANNAN familj (2026-08-08, Zaidas
  // önskemål: "om det står en familj jag är med i... då innebär det att
  // den inte skall vara min egen todo, utan just den familjens todo") —
  // satt bara vid en genuin match mot otherFamiliesForImport (se
  // parseTodoCsv). TodoImportExport.tsx:s runImport routar raden till
  // importCrossAccountTodo/updateCrossAccountTodo istället för den vanliga
  // onCreateTodo/onUpdateTodo när detta är satt. null = mitt eget konto
  // (oförändrat beteende, den absoluta majoriteten av rader).
  targetFamily: { accountId: Id; accountName: string } | null;
};

// En känd "annan familj" jag kan importera till (2026-08-08) — bara Mina
// familjekonton (genuint medlemskap, samma "jag är en riktig medlem
// där"-princip som redan gäller ALLA andra cross-account-skapande-vägar i
// appen), aldrig en Familjeanslutning (ingen egen identitet att tilldela
// uppgifter till/skapa som där).
export type OtherFamilyForImport = {
  accountId: Id;
  accountName: string;
  members: { id: Id; name: string }[];
};

export type TodoCsvParseResult = {
  rows: ParsedTodoRow[];
  errors: string[];
};

// Matchar "Tilldelad"-kolumnen mot ett kontonamn (skiftlägesokänsligt), "Mig
// själv" eller "Familjen" — tvetydiga eller okända namn hoppas inte över,
// utan flaggas som olösta (TodoImportExport.tsx frågar importören).
// En del externa verktyg (kalkylarksappar, AI-redigering av en exporterad
// fil) fyller tomma celler med ett bindestreck "-" istället för att lämna
// dem tomma (2026-08-04, Zaidas fynd — en stor import gav "okänt värde"/
// "ogiltig"-fel på nästan varje rad i Slutar/Fler tidsrutor/Återkommer/
// Startdatum/Slutdatum, alla med "-" som cellvärde). Tolkas nu som exakt
// samma sak som en tom cell överallt i importen.
function cellValue(cells: string[], col: number | undefined): string {
  const raw = (col !== undefined ? cells[col] : "")?.trim() ?? "";
  return raw === "-" ? "" : raw;
}

// defaultAssignee (2026-08-03) styr vad en TOM cell betyder — importörens
// eget id vid en vanlig import (oförändrat), null (Familjen) vid en
// familje-import, se TodoImportExport.tsx:s scope-prop.
// isFamilyScope (2026-08-06, Zaidas fynd: familjekategorier osynliga i
// familjevyn trots att de fanns i CSV-exporten) — en personlig och en
// familjekategori kan ha SAMMA namn (t.ex. "Rutiner", inget dedup-skydd
// någonstans i appen). Utan denna flagga matchade "Egen kategori"-cellen
// mot VILKEN kategori som helst med rätt namn, oavsett isFamily — en
// familje-import kunde då tyst peka om en rad till en redan existerande
// PERSONLIG kategori, som getFamilyViewTodos (selectors.ts) sedan filtrerar
// bort helt ur familjevyn utan varning.
export function parseTodoCsv(
  text: string,
  members: Member[],
  categories: TodoCategory[],
  currentMemberId: Id,
  defaultAssignee: Id | null = currentMemberId,
  isFamilyScope = false,
  otherFamiliesForImport: OtherFamilyForImport[] = []
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

  // Teckenkodningsfel (2026-08-05, Zaidas fynd — en fil redigerad i ett
  // externt program hade fått å/ä/ö förvanskade, t.ex. "Ãterkommer" istället
  // för "Återkommer") — "Stjärnor"/"Återkommer" är de ENDA två rubrikerna
  // med å/ä/ö i sitt korrekta namn, så en sådan förvanskning missar ALLTID
  // exakt dessa två kolumner (exakt matchning mot rätt stavning), medan alla
  // andra (rent ASCII) rubriker fortsätter fungera — vilket gör felet
  // förrädiskt tyst: raderna importeras ändå, bara som engångsuppgifter med
  // fel enstaka datum istället för återkommande, utan någon synlig varning.
  // Kan INTE alltid repareras automatiskt (stora Å/Ä/Ö tappar ofta hela
  // bytet vid en sådan skada, inte bara ett reversibelt teckenfel) — varnar
  // tydligt istället för att gissa.
  if ((starsCol === undefined || recurrenceCol === undefined) && headerRow.join(",").includes("Ã")) {
    return {
      rows: [],
      errors: [
        `Filens teckenkodning verkar skadad — å/ä/ö i rubrikraden visas fel (t.ex. "Ãterkommer" istället för "Återkommer"). Det gör att kolumnen "Återkommer" och/eller "Stjärnor" inte kan hittas, vilket i sin tur gör att återkommande uppgifter tyst blir engångsuppgifter istället. Ladda ner en NY mall och klistra in dina rader i den istället för att spara om en redan exporterad fil i ett annat program.`
      ]
    };
  }
  const notesCol = col("Anteckningar");
  const idCol = col("Id");
  const deleteCol = col("Radera");
  const familyCol = col("Familj");

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

    const sourceId = cellValue(cells, idCol) || null;

    // Familj (2026-08-08) — en ifylld cell som matchar en känd ANNAN familj
    // (Mina familjekonton) routar HELA raden dit, se targetFamily-kommentaren
    // på ParsedTodoRow. En ifylld cell som INTE matchar någon känd familj
    // (fel stavning, eller en familj jag inte längre är medlem i) hoppas
    // över med ett tydligt fel — tyst falla tillbaka på mitt eget konto hade
    // riskerat att en avsedd-för-någon-annan-uppgift av misstag hamnar hos mig.
    const familyLabel = cellValue(cells, familyCol);
    let targetFamily: { accountId: Id; accountName: string } | null = null;
    let effectiveMembers = members;
    if (familyLabel) {
      const match = otherFamiliesForImport.find((f) => f.accountName.toLowerCase() === familyLabel.toLowerCase());
      if (!match) {
        errors.push(
          `Rad ${rowNumber} ("${title}"): okänd familj "${familyLabel}" i Familj-kolumnen — du måste vara medlem där via Mina familjekonton för att importera dit, raden hoppas över.`
        );
        return;
      }
      targetFamily = { accountId: match.accountId, accountName: match.accountName };
      effectiveMembers = match.members.map((m) => ({ ...m, deletedAt: null }) as Member);
    }

    // Radera (2026-08-04, Zaidas önskemål: "ladda ner alla todos, uppdatera,
    // lägga till nya och radera de jag inte vill ha kvar längre, sedan
    // importera") — kort-slutar hela raden HÄR, ingen av de övriga
    // kolumnerna (kategori/datum/återkommelse/delmoment osv) tolkas eller
    // valideras, de är irrelevanta för en radering och skulle bara kunna ge
    // missvisande fel på en rad som ändå ska bort. Kräver ett Id — utan ett
    // sådant finns ingen befintlig todo att matcha mot och radera.
    const deleteRaw = cellValue(cells, deleteCol);
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
        deleteRow: true,
        targetFamily
      });
      return;
    }

    const emojiRaw = cellValue(cells, emojiCol);
    const emoji = emojiRaw && EMOJI_PATTERN.test(emojiRaw) ? emojiRaw : DEFAULT_EMOJI;

    const assignedLabel = cellValue(cells, assignedCol);
    // En cross-account-rads DEFAULT (tom Tilldelad-cell) är Familjen i
    // MÅLKONTOT, aldrig mitt eget defaultAssignee — mitt medlems-id existerar
    // inte där, och "mig själv" är meningslöst för en annan familjs uppgift.
    let assignedTo: Id | null = targetFamily ? null : defaultAssignee;
    let unresolvedAssigneeLabel: string | null = null;
    if (assignedLabel && assignedLabel.toLowerCase() === FAMILY_LABEL.toLowerCase()) {
      assignedTo = null;
    } else if (assignedLabel && (targetFamily || assignedLabel.toLowerCase() !== SELF_LABEL.toLowerCase())) {
      // "Mig själv" är bara en giltig genväg i MITT EGET konto (targetFamily
      //===null) — för en cross-account-rad finns inget sådant, ett namn
      // måste matchas mot en riktig medlem i målfamiljen precis som alla
      // andra namn.
      const matches = effectiveMembers.filter(
        (m) => m.deletedAt === null && m.name.toLowerCase() === assignedLabel.toLowerCase()
      );
      if (matches.length === 1) {
        assignedTo = matches[0].id;
      } else if (matches.length > 1) {
        errors.push(`Rad ${rowNumber} ("${title}"): flera medlemmar heter "${assignedLabel}", hoppas över — döp om eller lämna tomt för dig själv.`);
        return;
      } else if (targetFamily) {
        // Okänt namn i EN ANNAN familj (2026-08-08) — ingen namn-mappnings-
        // dialog finns för andras medlemmar (till skillnad från grenen
        // nedan, som gäller MIN EGEN familj) — raden hoppas över med ett
        // tydligt fel istället för att gissa fel person i en annan familj.
        errors.push(
          `Rad ${rowNumber} ("${title}"): "${assignedLabel}" är ingen medlem i ${targetFamily.accountName}, raden hoppas över.`
        );
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
    // Egen kategori medvetet IGNORERAD för en cross-account-rad (2026-08-08)
    // — mina personliga/familjekategorier finns i MITT konto, kan aldrig
    // matchas mot eller skapas i en annan familjs konto utan en egen,
    // separat kategori-hanteringsväg dit (inte byggd denna gång). Uppgiften
    // hamnar okategoriserad i målkontot istället för att gissa fel.
    const categoryLabel = targetFamily ? "" : cellValue(cells, categoryCol);
    let personalCategoryId: Id | null = null;
    let newCategoryName: string | null = null;
    if (categoryLabel) {
      // Matcha bara inom rätt scope (samma regel som avgör en NY kategoris
      // isFamily-värde, se TodoImportExport.tsx:s runImport) — en familje-rad
      // ska aldrig kapa en likanämnd personlig kategori, och tvärtom.
      const wantsFamilyCategory = isFamilyScope || assignedTo === null;
      const existing = categories.find(
        (c) => c.name.toLowerCase() === categoryLabel.toLowerCase() && Boolean(c.isFamily) === wantsFamilyCategory
      );
      if (existing) {
        personalCategoryId = existing.id;
      } else {
        newCategoryName = categoryLabel;
      }
    }

    const starsRaw = cellValue(cells, starsCol);
    const starValue = starsRaw ? Math.max(0, parseInt(starsRaw, 10) || 0) : 0;

    const timerRaw = cellValue(cells, timerCol);
    const timerEnabled = timerRaw.toLowerCase() === YES_LABEL.toLowerCase();

    const timerMinutesRaw = cellValue(cells, timerMinutesCol);
    const plannedDurationMinutes = timerMinutesRaw
      ? Math.max(1, Math.min(480, parseInt(timerMinutesRaw, 10) || 1))
      : null;

    const startRaw = cellValue(cells, startCol);
    const endRaw = cellValue(cells, endCol);
    const visibleFrom = dateTimeDisplayToISO(startRaw, false);
    const expiresAt = dateTimeDisplayToISO(endRaw, true);
    if (startRaw && !visibleFrom) {
      errors.push(`Rad ${rowNumber} ("${title}"): ogiltigt startdatum "${startRaw}" (vänta ÅÅÅÅ-MM-DD eller ÅÅÅÅ-MM-DD TT:MM), ignoreras.`);
    }
    if (endRaw && !expiresAt) {
      errors.push(`Rad ${rowNumber} ("${title}"): ogiltigt slutdatum "${endRaw}" (vänta ÅÅÅÅ-MM-DD eller ÅÅÅÅ-MM-DD TT:MM), ignoreras.`);
    }

    const recurrenceLabel = cellValue(cells, recurrenceCol);
    let recurrence: RecurrenceRule = { type: "none" };
    if (recurrenceLabel && recurrenceLabel.toLowerCase() !== NONE_LABEL.toLowerCase()) {
      const unit = RECURRENCE_LABEL_TO_UNIT.get(recurrenceLabel.toLowerCase());
      if (!unit) {
        errors.push(
          `Rad ${rowNumber} ("${title}"): okänt värde "${recurrenceLabel}" i Återkommer (vänta Dag/Vecka/Månad/År/Nej), behandlas som engångsuppgift.`
        );
      } else {
        const intervalRaw = cellValue(cells, intervalCol);
        const every = intervalRaw ? Math.max(1, parseInt(intervalRaw, 10) || 1) : 1;

        let daysOfWeek: Weekday[] | null = null;
        if (unit === "week") {
          const weekdaysRaw = cellValue(cells, weekdaysCol);
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
    const recurrenceEndRaw = cellValue(cells, recurrenceEndCol);
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
    const extraWindowsRaw = cellValue(cells, extraWindowsCol);
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

    const subtasksRaw = cellValue(cells, subtasksCol);
    const subtasks: TodoSubtask[] = csvToSubtaskTitles(subtasksRaw).map((subtaskTitle) => ({
      id: `subtask-${generateId()}`,
      title: subtaskTitle,
      done: false
    }));

    const notes = cellValue(cells, notesCol) || null;

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
      deleteRow: false,
      targetFamily
    });
  });

  return { rows, errors };
}
