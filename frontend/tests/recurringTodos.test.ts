import { describe, test, expect } from "vitest";
import { getDateKey, getDueRecurringTodoOccurrences } from "../src/features/todos/recurringTodos";
import { createTodo } from "./testUtils";

const monday = new Date("2026-06-08T08:00:00.000Z");
const tuesday = new Date("2026-06-09T08:00:00.000Z");

describe("recurringTodos", () => {
  test("weekly recurrence creates an occurrence on a matching weekday", () => {
    const template = createTodo({
      id: "todo-weekly",
      title: "Bädda sängen",
      createdBy: "member-parent",
      assignedTo: "member-child",
      starValue: 3,
      visual: { type: "lucide-icon", value: "Bed" },
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday"] },
      visibleFrom: "2026-06-01T07:00:00.000Z",
      expiresAt: "2026-06-01T09:00:00.000Z"
    });
    const occurrences = getDueRecurringTodoOccurrences([template], monday);
    const occ = occurrences[0];
    expect(occ).toBeDefined();
    expect(occurrences.length).toBe(1);
    expect(occ!.id).toBe("todo-weekly-occurrence-2026-06-08");
    expect(occ!.title).toBe("Bädda sängen");
    expect(occ!.createdBy).toBe("member-parent");
    expect(occ!.assignedTo).toBe("member-child");
    expect(occ!.starValue).toBe(3);
    expect(occ!.visual.value).toBe("Bed");
    expect(occ!.recurrence.type).toBe("none");
    expect(occ!.recurringSourceId).toBe("todo-weekly");
    expect(occ!.occurrenceDate).toBe("2026-06-08");
    expect(occ!.visibleFrom).toBe("2026-06-08T07:00:00.000Z");
    expect(occ!.expiresAt).toBe("2026-06-08T09:00:00.000Z");
  });

  test("weekly recurrence does not create an occurrence on a non-matching weekday", () => {
    const template = createTodo({
      id: "todo-weekly",
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday"] },
      visibleFrom: "2026-06-01T07:00:00.000Z"
    });
    expect(getDueRecurringTodoOccurrences([template], tuesday).length).toBe(0);
  });

  test("day-interval recurrence creates an occurrence when the interval matches", () => {
    const template = createTodo({
      id: "todo-interval",
      recurrence: { type: "recurring", unit: "day", every: 2, daysOfWeek: null },
      visibleFrom: "2026-06-06T07:00:00.000Z"
    });
    const occurrences = getDueRecurringTodoOccurrences([template], monday);
    expect(occurrences.length).toBe(1);
    expect(occurrences[0]?.id).toBe("todo-interval-occurrence-2026-06-08");
  });

  test("week-interval combined with specific weekdays: every 2nd week on monday", () => {
    // 2026-06-01 är en måndag — startveckan. Nästa måndag i samma vecka-par
    // (varannan vecka) är 2026-06-15, INTE 2026-06-08.
    const template = createTodo({
      id: "todo-biweekly",
      recurrence: { type: "recurring", unit: "week", every: 2, daysOfWeek: ["monday"] },
      visibleFrom: "2026-06-01T07:00:00.000Z"
    });
    expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-08T08:00:00.000Z")).length).toBe(0);
    expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-15T08:00:00.000Z")).length).toBe(1);
  });

  test("week-interval on a matching interval week but non-selected weekday does not create an occurrence", () => {
    const template = createTodo({
      id: "todo-biweekly-2",
      recurrence: { type: "recurring", unit: "week", every: 2, daysOfWeek: ["monday"] },
      visibleFrom: "2026-06-01T07:00:00.000Z"
    });
    // 2026-06-16 är rätt vecka (varannan vecka), men en tisdag, inte måndag.
    expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-16T08:00:00.000Z")).length).toBe(0);
  });

  test("monthly recurrence creates an occurrence on the same day-of-month every N months", () => {
    const template = createTodo({
      id: "todo-monthly",
      recurrence: { type: "recurring", unit: "month", every: 2, daysOfWeek: null },
      visibleFrom: "2026-06-08T07:00:00.000Z"
    });
    // En månad senare (2026-07-08) — every:2 betyder varannan månad, ska INTE slå till.
    expect(getDueRecurringTodoOccurrences([template], new Date("2026-07-08T08:00:00.000Z")).length).toBe(0);
    // Två månader senare (2026-08-08) — ska slå till.
    expect(getDueRecurringTodoOccurrences([template], new Date("2026-08-08T08:00:00.000Z")).length).toBe(1);
    // Rätt månad men fel dag i månaden — ska INTE slå till.
    expect(getDueRecurringTodoOccurrences([template], new Date("2026-08-09T08:00:00.000Z")).length).toBe(0);
  });

  test("recurrence does not create duplicate occurrences for the same source and day", () => {
    const template = createTodo({
      id: "todo-weekly",
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday"] },
      visibleFrom: "2026-06-01T07:00:00.000Z"
    });
    const existingOccurrence = createTodo({
      id: "todo-weekly-occurrence-2026-06-08",
      recurrence: { type: "none" },
      recurringSourceId: template.id,
      occurrenceDate: "2026-06-08"
    });
    expect(getDueRecurringTodoOccurrences([template, existingOccurrence], monday).length).toBe(0);
  });

  test("deleted recurring templates do not create occurrences", () => {
    const template = createTodo({
      id: "todo-deleted-template",
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday"] },
      visibleFrom: "2026-06-01T07:00:00.000Z",
      deletedAt: "2026-06-07T12:00:00.000Z",
      deletedBy: "member-parent"
    });
    expect(getDueRecurringTodoOccurrences([template], monday).length).toBe(0);
  });

  test("routine anchor time stays at the same local clock time", () => {
    const template = createTodo({
      id: "todo-local-time",
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday"] },
      visibleFrom: new Date(2000, 0, 1, 7, 0, 0, 0).toISOString(),
      expiresAt: new Date(2000, 0, 1, 8, 30, 0, 0).toISOString()
    });
    const occurrences = getDueRecurringTodoOccurrences([template], new Date(2026, 5, 8, 7, 15, 0, 0));
    const occ = occurrences[0];
    expect(occ).toBeDefined();
    expect(occ!.occurrenceDate).toBe("2026-06-08");
    expect(occ!.visibleFrom).toBe(new Date(2026, 5, 8, 7, 0, 0, 0).toISOString());
    expect(occ!.expiresAt).toBe(new Date(2026, 5, 8, 8, 30, 0, 0).toISOString());
  });

  test("date keys use the local calendar day", () => {
    expect(getDateKey(new Date(2026, 5, 8, 0, 30, 0, 0))).toBe("2026-06-08");
  });
});
