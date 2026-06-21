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
  return date.toISOString().slice(0, 10);
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
    return recurrence.daysOfWeek.includes(weekdays[now.getUTCDay()]);
  }

  const elapsedDays = Math.floor(
    (startOfUtcDay(now).getTime() - startOfUtcDay(startDate).getTime()) /
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
    Date.UTC(
      year,
      month - 1,
      day,
      sourceDate.getUTCHours(),
      sourceDate.getUTCMinutes(),
      sourceDate.getUTCSeconds(),
      sourceDate.getUTCMilliseconds()
    )
  ).toISOString();
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}
