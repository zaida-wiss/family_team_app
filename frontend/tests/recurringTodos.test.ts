import { getDueRecurringTodoOccurrences } from "../src/features/todos/recurringTodos.js";
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

      expectEqual(occurrences.length, 1);
      expectEqual(occurrences[0]?.id, "todo-weekly-occurrence-2026-06-08");
      expectEqual(occurrences[0]?.title, "Bädda sängen");
      expectEqual(occurrences[0]?.createdBy, "member-parent");
      expectEqual(occurrences[0]?.assignedTo, "member-child");
      expectEqual(occurrences[0]?.starValue, 3);
      expectEqual(occurrences[0]?.visual.value, "Bed");
      expectEqual(occurrences[0]?.recurrence.type, "none");
      expectEqual(occurrences[0]?.recurringSourceId, "todo-weekly");
      expectEqual(occurrences[0]?.occurrenceDate, "2026-06-08");
      expectEqual(occurrences[0]?.visibleFrom, "2026-06-08T07:00:00.000Z");
      expectEqual(occurrences[0]?.expiresAt, "2026-06-08T09:00:00.000Z");
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
  }
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}
