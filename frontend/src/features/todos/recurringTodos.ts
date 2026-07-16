import type { RecurrenceRule, Todo, TodoTimeWindow, Weekday } from "@shared/types";
import { timeToAnchorISO as sharedTimeToAnchorISO, isoToTimeInput as sharedIsoToTimeInput, withWallClockOnDate } from "../../utils/todoTimeZone";

const weekdays: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

// Korta svenska veckodagsetiketter — delad mellan visa-vyn (TodoDetailView)
// och återkommande-väljaren (RecurrencePicker), båda i todos-featuren.
export const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: "mån",
  tuesday: "tis",
  wednesday: "ons",
  thursday: "tors",
  friday: "fre",
  saturday: "lör",
  sunday: "sön"
};

// Tid-input-hjälpare, delade mellan TimeWindowsPicker och skapa/redigera-
// modalerna. Själva tidszons-logiken (fixedTodoTimes) ligger i utils/
// todoTimeZone.ts — delad med routineHelpers.ts (barnens rutinskapare), som
// tidigare hade en egen, icke tidszon-medveten kopia av samma konvertering.
export function timeToAnchorISO(hhmm: string, fixedTodoTimes = false): string | null {
  return sharedTimeToAnchorISO(hhmm, fixedTodoTimes);
}

export function isoToTimeInput(iso: string | null, fixedTodoTimes = false): string {
  return sharedIsoToTimeInput(iso, fixedTodoTimes);
}

export function dateOnlyToISO(yyyyMmDd: string): string | null {
  if (!yyyyMmDd) return null;
  return new Date(`${yyyyMmDd}T00:00:00`).toISOString();
}

export function isoToDateOnly(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Flera tidsintervall per dag på samma mall (2026-07-05, Zaidas önskemål, t.ex.
// "borsta tänder" morgon OCH kväll) — en mall med timeWindows genererar EN
// occurrence PER tidsfönster PER förfallodag istället för bara en. Helt
// bakåtkompatibelt: saknas timeWindows (eller är tom) faller det tillbaka på
// mallens egna visibleFrom/expiresAt som ett enda implicit fönster, precis
// som innan detta fältet fanns.
export function getDueRecurringTodoOccurrences(
  todos: Todo[],
  now = new Date(),
  fixedTodoTimes = false
): Todo[] {
  const dateKey = getDateKey(now);
  const dueTemplates = todos
    .filter((todo) => isRecurringTemplate(todo))
    .filter((todo) => isRecurrenceDue(todo.recurrence, todo.visibleFrom, now));

  const occurrences: Todo[] = [];
  for (const template of dueTemplates) {
    const windows: TodoTimeWindow[] =
      template.timeWindows && template.timeWindows.length > 0
        ? template.timeWindows
        : [{ visibleFrom: template.visibleFrom, expiresAt: template.expiresAt }];

    windows.forEach((window, index) => {
      const id = occurrenceId(template.id, dateKey, windows.length > 1 ? index : null);
      if (todos.some((t) => t.id === id)) return;
      occurrences.push(createOccurrence(template, dateKey, window, id, fixedTodoTimes));
    });
  }
  return occurrences;
}

function occurrenceId(templateId: string, dateKey: string, windowIndex: number | null): string {
  return windowIndex === null
    ? `${templateId}-occurrence-${dateKey}`
    : `${templateId}-occurrence-${dateKey}-${windowIndex}`;
}

export function isRecurringTemplate(todo: Todo): boolean {
  return (
    todo.deletedAt === null &&
    todo.recurringSourceId === null &&
    todo.recurrence.type !== "none"
  );
}

export function getDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

// Ordnad (måndag→söndag) veckodagslista — används för att räkna "hur många av
// de valda veckodagarna infaller på eller före idag" (occurrenceIndexForWeek).
const WEEKDAY_ORDER: Weekday[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
];

// Slutvillkor (2026-07-07, Zaidas önskemål): "never" (standard, saknas fältet
// helt tolkas likadant) gör ingen skillnad. "until" stoppar serien efter ett
// visst datum (inklusive själva det datumet). "count" stoppar efter att
// serien totalt kört ett visst antal gånger — kräver att veta VILKET
// tillfälle dagens (annars redan mönster-matchande) datum skulle vara,
// därav occurrenceIndex-parametern (0-indexerad, uträknad per enhet nedan).
function isWithinRecurrenceEnd(
  recurrence: Extract<RecurrenceRule, { type: "recurring" }>,
  now: Date,
  occurrenceIndex: number
): boolean {
  const end = recurrence.end;
  if (!end || end.type === "never") return true;
  if (end.type === "until") {
    return startOfLocalDay(now).getTime() <= startOfLocalDay(new Date(end.date)).getTime();
  }
  return occurrenceIndex < end.count;
}

// Räknar ut det 0-indexerade tillfälle som "idag" skulle vara för unit==="week"
// — flera veckodagar per vecka gör detta mer invecklat än ett enkelt
// dag/månads-intervall (se isRecurrenceDue). Anropas bara när dagens veckodag
// och veckointervall redan är bekräftat mönster-matchande.
function occurrenceIndexForWeek(daysOfWeek: Weekday[], every: number, weeksElapsed: number, now: Date): number {
  const priorQualifyingWeeks = weeksElapsed > 0 ? Math.floor((weeksElapsed - 1) / every) + 1 : 0;
  const todayOrder = WEEKDAY_ORDER.indexOf(weekdays[now.getDay()]);
  const selectedUpToToday = daysOfWeek.filter((d) => WEEKDAY_ORDER.indexOf(d) <= todayOrder).length;
  return priorQualifyingWeeks * daysOfWeek.length + selectedUpToToday - 1;
}

// Förfallologik för den kombinerade enhet+intervall+veckodagar-modellen
// (ADR-0015, "year" tillagt 2026-07-07). "week" kräver att dagens veckodag
// finns i daysOfWeek OCH att antalet hela veckor sedan startveckan är delbart
// med every (t.ex. "var 3:e vecka på måndag+onsdag"). "month"/"year" kräver
// samma dag-i-månaden (och för år: samma månad) som startDate. "day" är ett
// enkelt dagsintervall, som tidigare. Ett valfritt slutvillkor (end) kan
// stoppa serien efter ett datum eller ett antal gånger, se isWithinRecurrenceEnd.
function isRecurrenceDue(
  recurrence: RecurrenceRule,
  visibleFrom: string | null,
  now: Date
): boolean {
  if (recurrence.type === "none") {
    return false;
  }

  const startDate = visibleFrom ? new Date(visibleFrom) : now;

  if (startOfLocalDay(startDate).getTime() > startOfLocalDay(now).getTime()) {
    return false;
  }

  if (recurrence.unit === "week") {
    if (!recurrence.daysOfWeek?.includes(weekdays[now.getDay()])) {
      return false;
    }
    const weeksElapsed = Math.floor(
      (startOfWeek(now).getTime() - startOfWeek(startDate).getTime()) / (7 * 86_400_000)
    );
    if (weeksElapsed < 0 || weeksElapsed % recurrence.every !== 0) return false;
    const occurrenceIndex = occurrenceIndexForWeek(recurrence.daysOfWeek, recurrence.every, weeksElapsed, now);
    return isWithinRecurrenceEnd(recurrence, now, occurrenceIndex);
  }

  if (recurrence.unit === "month") {
    if (now.getDate() !== startDate.getDate()) {
      return false;
    }
    const monthsElapsed =
      (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
    if (monthsElapsed < 0 || monthsElapsed % recurrence.every !== 0) return false;
    return isWithinRecurrenceEnd(recurrence, now, monthsElapsed / recurrence.every);
  }

  if (recurrence.unit === "year") {
    if (now.getDate() !== startDate.getDate() || now.getMonth() !== startDate.getMonth()) {
      return false;
    }
    const yearsElapsed = now.getFullYear() - startDate.getFullYear();
    if (yearsElapsed < 0 || yearsElapsed % recurrence.every !== 0) return false;
    return isWithinRecurrenceEnd(recurrence, now, yearsElapsed / recurrence.every);
  }

  const elapsedDays = Math.floor(
    (startOfLocalDay(now).getTime() - startOfLocalDay(startDate).getTime()) /
      86_400_000
  );
  if (elapsedDays < 0 || elapsedDays % recurrence.every !== 0) return false;
  return isWithinRecurrenceEnd(recurrence, now, elapsedDays / recurrence.every);
}

// Måndagsankrad vecka (svensk kalenderkonvention) — getDay(): 0=söndag.
function startOfWeek(date: Date): Date {
  const day = startOfLocalDay(date);
  const diffToMonday = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - diffToMonday);
  return day;
}

function createOccurrence(
  template: Todo, dateKey: string, window: TodoTimeWindow, id: string, fixedTodoTimes = false
): Todo {
  const visibleFrom = withWallClockOnDate(window.visibleFrom, dateKey, fixedTodoTimes);
  const expiresAt = createOccurrenceExpiresAt(
    window.visibleFrom,
    window.expiresAt,
    visibleFrom,
    dateKey,
    fixedTodoTimes
  );

  return {
    ...template,
    id,
    status: "pending",
    recurrence: { type: "none" },
    recurringSourceId: template.id,
    occurrenceDate: dateKey,
    timeWindows: undefined,
    visibleFrom,
    expiresAt,
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    deletedAt: null,
    deletedBy: null
  };
}

function createOccurrenceExpiresAt(
  templateVisibleFrom: string | null,
  templateExpiresAt: string | null,
  occurrenceVisibleFrom: string | null,
  dateKey: string,
  fixedTodoTimes = false
) {
  if (!templateExpiresAt) {
    return null;
  }

  if (templateVisibleFrom && occurrenceVisibleFrom) {
    // Ren ms-differens (varaktighet) — redan tidszon-oberoende, ingen
    // fixedTodoTimes-hantering behövs i den här grenen.
    const duration =
      new Date(templateExpiresAt).getTime() - new Date(templateVisibleFrom).getTime();

    return new Date(new Date(occurrenceVisibleFrom).getTime() + duration).toISOString();
  }

  return withWallClockOnDate(templateExpiresAt, dateKey, fixedTodoTimes);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Ett redigerat rutinmall-fält (titel, stjärnor, tid m.m.) speglas inte automatiskt
 * på en redan skapad dagens-kopia av rutinen — den är en frusen ögonblicksbild.
 * Använd denna för att synka en occurrence med sin malls aktuella värden,
 * t.ex. direkt efter en redigering eller vid manuell "visa igen idag".
 */
export function applyTemplateToOccurrence(
  occurrence: Pick<Todo, "occurrenceDate">,
  template: Pick<
    Todo,
    | "title"
    | "starValue"
    | "visual"
    | "personalCategoryId"
    | "visibleFrom"
    | "expiresAt"
    | "assignedTo"
    | "timerEnabled"
    | "plannedDurationMinutes"
  >,
  fixedTodoTimes = false
): Partial<Todo> {
  const dateKey = occurrence.occurrenceDate ?? getDateKey(new Date());
  const visibleFrom = withWallClockOnDate(template.visibleFrom, dateKey, fixedTodoTimes);
  const expiresAt = createOccurrenceExpiresAt(template.visibleFrom, template.expiresAt, visibleFrom, dateKey, fixedTodoTimes);

  return {
    title: template.title,
    starValue: template.starValue,
    visual: template.visual,
    personalCategoryId: template.personalCategoryId,
    visibleFrom,
    expiresAt,
    // Tillagt 2026-07-08 (Zaidas önskemål om full fältparitet mellan skapa/
    // redigera) — mottagare och timerinställningar hör lika mycket till
    // mallen som titel/stjärnor/kategori, se createOccurrence som redan
    // sprider ALLA malfält till en helt ny occurrence.
    assignedTo: template.assignedTo,
    timerEnabled: template.timerEnabled,
    plannedDurationMinutes: template.plannedDurationMinutes,
  };
}
