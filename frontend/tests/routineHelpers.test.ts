import { describe, test, expect } from "vitest";
import { copyRoutineTemplate } from "../src/features/children/routineHelpers";
import { createTodo } from "./testUtils";

describe("copyRoutineTemplate", () => {
  test("copies template-defining fields to the new child, never progress fields", () => {
    const source = createTodo({
      id: "routine-1",
      title: "Borsta tänderna",
      createdBy: "member-parent",
      assignedTo: "member-child-a",
      starValue: 2,
      visual: { type: "lucide-icon", value: "Sparkles" },
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday", "tuesday"] },
      visibleFrom: "2026-06-01T07:00:00.000Z",
      expiresAt: "2026-06-01T08:00:00.000Z",
      personalCategoryId: "cat-1",
      notes: "Kom ihåg fluor",
      status: "done",
      completedAt: "2026-06-01T07:10:00.000Z",
      approvedBy: "member-parent",
      approvedAt: "2026-06-01T07:15:00.000Z",
      subtasks: [{ id: "subtask-old", title: "Övre raden", done: true }]
    });

    const copy = copyRoutineTemplate(source, "member-child-b", "member-parent");

    expect(copy.id).not.toBe(source.id);
    expect(copy.assignedTo).toBe("member-child-b");
    expect(copy.createdBy).toBe("member-parent");
    expect(copy.title).toBe("Borsta tänderna");
    expect(copy.starValue).toBe(2);
    expect(copy.visual).toEqual({ type: "lucide-icon", value: "Sparkles" });
    expect(copy.recurrence).toEqual(source.recurrence);
    expect(copy.visibleFrom).toBe(source.visibleFrom);
    expect(copy.expiresAt).toBe(source.expiresAt);
    expect(copy.personalCategoryId).toBe("cat-1");
    expect(copy.notes).toBe("Kom ihåg fluor");

    // Aldrig kopierade — det nya barnet börjar från ett rent blad
    expect(copy.status).toBe("pending");
    expect(copy.completedAt).toBeNull();
    expect(copy.approvedBy).toBeNull();
    expect(copy.approvedAt).toBeNull();
    expect(copy.recurringSourceId).toBeNull();
    expect(copy.occurrenceDate).toBeNull();

    // Delmoment får nya id:n och nollställs
    expect(copy.subtasks).toHaveLength(1);
    expect(copy.subtasks![0].id).not.toBe("subtask-old");
    expect(copy.subtasks![0].title).toBe("Övre raden");
    expect(copy.subtasks![0].done).toBe(false);
  });

  test("two calls produce different ids (no accidental duplicate key)", () => {
    const source = createTodo({ id: "routine-1", assignedTo: "member-child-a" });
    const copyA = copyRoutineTemplate(source, "member-child-b", "member-parent");
    const copyB = copyRoutineTemplate(source, "member-child-b", "member-parent");
    expect(copyA.id).not.toBe(copyB.id);
  });
});
