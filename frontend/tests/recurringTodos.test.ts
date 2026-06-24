import { getDateKey, getDueRecurringTodoOccurrences } from "../src/features/todos/recurringTodos.js";
import { createTodo, expectEqual, type TestCase } from "./testUtils.js";

const monday = new Date("2026-06-08T08:00:00.000Z");
const tuesday = new Date("2026-06-09T08:00:00.000Z");

const tests: TestCase[] = [
  {
    name: "weekly recurrence creates an occurrence on a matching weekday",
    run: () => {
      const template = createTodo({
        id: "todo-weekly",
        title: "Bädda sängen",
        createdBy: "member-parent",
        assignedTo: "member-child",
        starValue: 3,
        visual: { type: "lucide-icon", value: "Bed" },
        recurrence: { type: "weekly", daysOfWeek: ["monday"] },
        visibleFrom: "2026-06-01T07:00:00.000Z",
        expiresAt: "2026-06-01T09:00:00.000Z"
      });
      const occurrences = getDueRecurringTodoOccurrences([template], monday);
      const occ = occurrences[0];
      if (!occ) throw new Error("Expected an occurrence");

      expectEqual(occurrences.length, 1);
      expectEqual(occ.id, "todo-weekly-occurrence-2026-06-08");
      expectEqual(occ.title, "Bädda sängen");
      expectEqual(occ.createdBy, "member-parent");
      expectEqual(occ.assignedTo, "member-child");
      expectEqual(occ.starValue, 3);
      expectEqual(occ.visual.value, "Bed");
      expectEqual(occ.recurrence.type, "none");
      expectEqual(occ.recurringSourceId, "todo-weekly");
      expectEqual(occ.occurrenceDate, "2026-06-08");
      expectEqual(occ.visibleFrom, "2026-06-08T07:00:00.000Z");
      expectEqual(occ.expiresAt, "2026-06-08T09:00:00.000Z");
    }
  },
  {
    name: "weekly recurrence does not create an occurrence on a non-matching weekday",
    run: () => {
      const template = createTodo({
        id: "todo-weekly",
        recurrence: { type: "weekly", daysOfWeek: ["monday"] },
        visibleFrom: "2026-06-01T07:00:00.000Z"
      });
      const occurrences = getDueRecurringTodoOccurrences([template], tuesday);

      expectEqual(occurrences.length, 0);
    }
  },
  {
    name: "interval recurrence creates an occurrence when the interval matches",
    run: () => {
      const template = createTodo({
        id: "todo-interval",
        recurrence: { type: "interval", every: 2, unit: "day" },
        visibleFrom: "2026-06-06T07:00:00.000Z"
      });
      const occurrences = getDueRecurringTodoOccurrences([template], monday);

      expectEqual(occurrences.length, 1);
      expectEqual(occurrences[0]?.id, "todo-interval-occurrence-2026-06-08");
    }
  },
  {
    name: "recurrence does not create duplicate occurrences for the same source and day",
    run: () => {
      const template = createTodo({
        id: "todo-weekly",
        recurrence: { type: "weekly", daysOfWeek: ["monday"] },
        visibleFrom: "2026-06-01T07:00:00.000Z"
      });
      const existingOccurrence = createTodo({
        id: "todo-weekly-occurrence-2026-06-08",
        recurrence: { type: "none" },
        recurringSourceId: template.id,
        occurrenceDate: "2026-06-08"
      });
      const occurrences = getDueRecurringTodoOccurrences(
        [template, existingOccurrence],
        monday
      );

      expectEqual(occurrences.length, 0);
    }
  },
  {
    name: "deleted recurring templates do not create occurrences",
    run: () => {
      const template = createTodo({
        id: "todo-deleted-template",
        recurrence: { type: "weekly", daysOfWeek: ["monday"] },
        visibleFrom: "2026-06-01T07:00:00.000Z",
        deletedAt: "2026-06-07T12:00:00.000Z",
        deletedBy: "member-parent"
      });
      const occurrences = getDueRecurringTodoOccurrences([template], monday);

      expectEqual(occurrences.length, 0);
    }
  },
  {
    name: "routine anchor time stays at the same local clock time",
    run: () => {
      const template = createTodo({
        id: "todo-local-time",
        recurrence: { type: "weekly", daysOfWeek: ["monday"] },
        visibleFrom: new Date(2000, 0, 1, 7, 0, 0, 0).toISOString(),
        expiresAt: new Date(2000, 0, 1, 8, 30, 0, 0).toISOString()
      });
      const occurrenceDate = new Date(2026, 5, 8, 7, 15, 0, 0);
      const occurrences = getDueRecurringTodoOccurrences([template], occurrenceDate);
      const occ = occurrences[0];
      if (!occ) throw new Error("Expected an occurrence");

      expectEqual(occ.occurrenceDate, "2026-06-08");
      expectEqual(occ.visibleFrom, new Date(2026, 5, 8, 7, 0, 0, 0).toISOString());
      expectEqual(occ.expiresAt, new Date(2026, 5, 8, 8, 30, 0, 0).toISOString());
    }
  },
  {
    name: "date keys use the local calendar day",
    run: () => {
      expectEqual(getDateKey(new Date(2026, 5, 8, 0, 30, 0, 0)), "2026-06-08");
    }
  }
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}
