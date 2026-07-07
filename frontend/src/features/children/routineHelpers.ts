import type { Id, Member, Todo, Weekday } from "@shared/types";

export const WEEKDAYS: { key: Weekday; short: string }[] = [
  { key: "monday",    short: "M" },
  { key: "tuesday",   short: "T" },
  { key: "wednesday", short: "O" },
  { key: "thursday",  short: "T" },
  { key: "friday",    short: "F" },
  { key: "saturday",  short: "L" },
  { key: "sunday",    short: "S" },
];

export const STAR_PRESETS = [1, 2, 3, 4, 5];

export function timeToAnchorISO(hhmm: string): string | null {
  if (!hhmm) return null;
  return new Date(`2000-01-01T${hhmm}:00`).toISOString();
}

export function isoToTimeInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function recurrenceKey(todo: Todo): string {
  if (todo.recurrence.type === "recurring") {
    const days = todo.recurrence.daysOfWeek ? [...todo.recurrence.daysOfWeek].sort().join(",") : "";
    return `recurring:${todo.recurrence.unit}:${todo.recurrence.every}:${days}`;
  }
  return "none";
}

export function routineGroupKey(todo: Todo): string {
  return [
    todo.title.trim().toLocaleLowerCase("sv"),
    todo.visual.type,
    todo.visual.value,
    String(todo.starValue),
    todo.visibleFrom ?? "",
    todo.expiresAt ?? "",
    todo.personalCategoryId ?? "",
    recurrenceKey(todo)
  ].join("|");
}

export function getStartSortValue(todo: Todo): number {
  if (!todo.visibleFrom) return Number.POSITIVE_INFINITY;
  const date = new Date(todo.visibleFrom);
  return date.getHours() * 60 + date.getMinutes();
}

export function getRoutineDays(todo: Todo): Weekday[] {
  return todo.recurrence.type === "recurring" ? todo.recurrence.daysOfWeek ?? [] : [];
}

export type RoutineGroup = {
  key: string;
  todos: Todo[];
  children: Member[];
};

export function groupRoutines(existingRoutines: Todo[], children: Member[]): RoutineGroup[] {
  return [...existingRoutines.reduce((groups, routine) => {
    const key = routineGroupKey(routine);
    const group = groups.get(key) ?? { key, todos: [], children: [] };
    group.todos.push(routine);

    const child = children.find((c) => c.id === routine.assignedTo);
    if (child && !group.children.some((c) => c.id === child.id)) {
      group.children.push(child);
    }

    groups.set(key, group);
    return groups;
  }, new Map<string, RoutineGroup>()).values()].sort((a, b) => {
    const primary = getStartSortValue(a.todos[0]) - getStartSortValue(b.todos[0]);
    if (primary !== 0) return primary;
    return a.todos[0].title.localeCompare(b.todos[0].title, "sv");
  });
}

export function findExistingRoutines(todos: Todo[], childIds: Set<Id>): Todo[] {
  return todos.filter(
    (t) =>
      t.assignedTo !== null &&
      childIds.has(t.assignedTo) &&
      t.recurrence.type !== "none" &&
      t.recurringSourceId === null &&
      t.deletedAt === null
  );
}
