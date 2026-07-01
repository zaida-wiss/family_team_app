import type { RecurrenceRule, Todo, Weekday } from "@shared/types";

const weekdays: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

export function getDueRecurringTodoOccurrences(
  todos: Todo[],
  now = new Date()
): Todo[] {
  const dateKey = getDateKey(now);

  return todos
    .filter((todo) => isRecurringTemplate(todo))
    .filter((todo) => isRecurrenceDue(todo.recurrence, todo.visibleFrom, now))
    .filter((todo) => !hasOccurrenceForDate(todos, todo.id, dateKey))
    .map((todo) => createOccurrence(todo, dateKey));
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

function isRecurrenceDue(
  recurrence: RecurrenceRule,
  visibleFrom: string | null,
  now: Date
): boolean {
  if (recurrence.type === "none") {
    return false;
  }

  const startDate = visibleFrom ? new Date(visibleFrom) : now;

  if (startDate.getTime() > now.getTime()) {
    return false;
  }

  if (recurrence.type === "weekly") {
    return recurrence.daysOfWeek.includes(weekdays[now.getDay()]);
  }

  const elapsedDays = Math.floor(
    (startOfLocalDay(now).getTime() - startOfLocalDay(startDate).getTime()) /
      86_400_000
  );
  const intervalDays =
    recurrence.unit === "week" ? recurrence.every * 7 : recurrence.every;

  return elapsedDays >= 0 && elapsedDays % intervalDays === 0;
}

function hasOccurrenceForDate(todos: Todo[], sourceId: string, dateKey: string) {
  return todos.some((todo) => {
    return todo.recurringSourceId === sourceId && todo.occurrenceDate === dateKey;
  });
}

function createOccurrence(template: Todo, dateKey: string): Todo {
  const visibleFrom = withOccurrenceDate(template.visibleFrom, dateKey);
  const expiresAt = createOccurrenceExpiresAt(
    template.visibleFrom,
    template.expiresAt,
    visibleFrom,
    dateKey
  );

  return {
    ...template,
    id: `${template.id}-occurrence-${dateKey}`,
    status: "pending",
    recurrence: { type: "none" },
    recurringSourceId: template.id,
    occurrenceDate: dateKey,
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
  dateKey: string
) {
  if (!templateExpiresAt) {
    return null;
  }

  if (templateVisibleFrom && occurrenceVisibleFrom) {
    const duration =
      new Date(templateExpiresAt).getTime() - new Date(templateVisibleFrom).getTime();

    return new Date(new Date(occurrenceVisibleFrom).getTime() + duration).toISOString();
  }

  return withOccurrenceDate(templateExpiresAt, dateKey);
}

function withOccurrenceDate(value: string | null, dateKey: string) {
  if (!value) {
    return `${dateKey}T00:00:00.000Z`;
  }

  const sourceDate = new Date(value);
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(
    year,
    month - 1,
    day,
    sourceDate.getHours(),
    sourceDate.getMinutes(),
    sourceDate.getSeconds(),
    sourceDate.getMilliseconds()
  ).toISOString();
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
  template: Pick<Todo, "title" | "starValue" | "visual" | "routineCategory" | "visibleFrom" | "expiresAt">
): Partial<Todo> {
  const dateKey = occurrence.occurrenceDate ?? getDateKey(new Date());
  const visibleFrom = withOccurrenceDate(template.visibleFrom, dateKey);
  const expiresAt = createOccurrenceExpiresAt(template.visibleFrom, template.expiresAt, visibleFrom, dateKey);

  return {
    title: template.title,
    starValue: template.starValue,
    visual: template.visual,
    routineCategory: template.routineCategory,
    visibleFrom,
    expiresAt,
  };
}
