import { describe, test, expect } from "vitest";
import { applyTemplateToOccurrence, getDateKey, getDueRecurringTodoOccurrences } from "../src/features/todos/recurringTodos";
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

  // Flera tidsintervall per dag (2026-07-05, Zaidas önskemål) — en mall med
  // timeWindows genererar EN occurrence PER fönster PER förfallodag.
  test("a template with multiple timeWindows creates one occurrence per window, same day", () => {
    const template = createTodo({
      id: "todo-brush-teeth",
      title: "Borsta tänderna",
      recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
      visibleFrom: "2026-06-01T07:00:00.000Z",
      timeWindows: [
        { visibleFrom: new Date(2000, 0, 1, 7, 0).toISOString(), expiresAt: new Date(2000, 0, 1, 7, 15).toISOString() },
        { visibleFrom: new Date(2000, 0, 1, 19, 0).toISOString(), expiresAt: new Date(2000, 0, 1, 19, 15).toISOString() }
      ]
    });

    const occurrences = getDueRecurringTodoOccurrences([template], monday);
    expect(occurrences.length).toBe(2);
    expect(occurrences.map((o) => o.id).sort()).toEqual([
      "todo-brush-teeth-occurrence-2026-06-08-0",
      "todo-brush-teeth-occurrence-2026-06-08-1"
    ]);
    const morning = occurrences.find((o) => o.id.endsWith("-0"));
    const evening = occurrences.find((o) => o.id.endsWith("-1"));
    expect(new Date(morning!.visibleFrom!).getHours()).toBe(7);
    expect(new Date(evening!.visibleFrom!).getHours()).toBe(19);
    // Varje occurrence är sin egen fristående todo — ingen delad recurrence.
    expect(morning!.recurrence.type).toBe("none");
    expect(morning!.recurringSourceId).toBe("todo-brush-teeth");
  });

  test("a template with multiple timeWindows does not duplicate an already-created window's occurrence", () => {
    const template = createTodo({
      id: "todo-brush-teeth",
      recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
      visibleFrom: "2026-06-01T07:00:00.000Z",
      timeWindows: [
        { visibleFrom: null, expiresAt: null },
        { visibleFrom: null, expiresAt: null }
      ]
    });
    const existingMorningOccurrence = createTodo({
      id: "todo-brush-teeth-occurrence-2026-06-08-0",
      recurrence: { type: "none" },
      recurringSourceId: template.id,
      occurrenceDate: "2026-06-08"
    });

    const occurrences = getDueRecurringTodoOccurrences([template, existingMorningOccurrence], monday);
    expect(occurrences.length).toBe(1);
    expect(occurrences[0]?.id).toBe("todo-brush-teeth-occurrence-2026-06-08-1");
  });

  test("a template without timeWindows behaves exactly as before (single implicit window)", () => {
    const template = createTodo({
      id: "todo-single",
      recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
      visibleFrom: "2026-06-01T07:00:00.000Z"
    });
    const occurrences = getDueRecurringTodoOccurrences([template], monday);
    expect(occurrences.length).toBe(1);
    expect(occurrences[0]?.id).toBe("todo-single-occurrence-2026-06-08");
  });

  // "year" tillagt 2026-07-07 (Zaidas önskemål, t.ex. födelsedagar).
  test("yearly recurrence creates an occurrence on the same day+month every N years", () => {
    const template = createTodo({
      id: "todo-yearly",
      recurrence: { type: "recurring", unit: "year", every: 2, daysOfWeek: null },
      visibleFrom: "2024-06-08T07:00:00.000Z"
    });
    // Ett år senare (2025) — every:2 betyder vartannat år, ska INTE slå till.
    expect(getDueRecurringTodoOccurrences([template], new Date("2025-06-08T08:00:00.000Z")).length).toBe(0);
    // Två år senare (2026), samma dag+månad — ska slå till.
    expect(getDueRecurringTodoOccurrences([template], monday).length).toBe(1);
    // Rätt år men fel dag — ska INTE slå till.
    expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-09T08:00:00.000Z")).length).toBe(0);
  });

  // Slutvillkor (2026-07-07, Zaidas önskemål): "en sluttid med datum,
  // alternativt hur många gånger det ska upprepa sig".
  describe("slutvillkor (RecurrenceEnd)", () => {
    test("saknat end-fält (befintlig data) beter sig som 'never' — repeterar oförändrat", () => {
      const template = createTodo({
        id: "todo-no-end",
        recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
        visibleFrom: "2026-06-01T07:00:00.000Z"
      });
      expect(getDueRecurringTodoOccurrences([template], monday).length).toBe(1);
    });

    test("'until' stoppar serien efter slutdatumet, men inte på eller före det", () => {
      const template = createTodo({
        id: "todo-until",
        recurrence: {
          type: "recurring", unit: "day", every: 1, daysOfWeek: null,
          end: { type: "until", date: "2026-06-08" }
        },
        visibleFrom: "2026-06-01T07:00:00.000Z"
      });
      expect(getDueRecurringTodoOccurrences([template], monday).length).toBe(1);
      expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-09T08:00:00.000Z")).length).toBe(0);
    });

    test("'count' på ett dagsintervall stoppar serien efter angivet antal gånger", () => {
      const template = createTodo({
        id: "todo-count-day",
        recurrence: {
          type: "recurring", unit: "day", every: 1, daysOfWeek: null,
          end: { type: "count", count: 2 }
        },
        visibleFrom: "2026-06-08T07:00:00.000Z"
      });
      // Tillfälle 1 (idag, index 0) — inom gränsen.
      expect(getDueRecurringTodoOccurrences([template], monday).length).toBe(1);
      // Tillfälle 2 (index 1, dag efter) — fortfarande inom gränsen (count:2).
      expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-09T08:00:00.000Z")).length).toBe(1);
      // Tillfälle 3 (index 2) — utanför gränsen, serien har redan kört klart.
      expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-10T08:00:00.000Z")).length).toBe(0);
    });

    test("'count' på veckovis återkommelse med flera veckodagar räknar varje veckodag som ett eget tillfälle", () => {
      const template = createTodo({
        id: "todo-count-week",
        recurrence: {
          type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday", "wednesday"],
          end: { type: "count", count: 3 }
        },
        // Startveckans måndag.
        visibleFrom: "2026-06-08T07:00:00.000Z"
      });
      // Vecka 1, måndag — tillfälle 1.
      expect(getDueRecurringTodoOccurrences([template], monday).length).toBe(1);
      // Vecka 1, onsdag — tillfälle 2.
      expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-10T08:00:00.000Z")).length).toBe(1);
      // Vecka 2, måndag — tillfälle 3, sista tillåtna.
      expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-15T08:00:00.000Z")).length).toBe(1);
      // Vecka 2, onsdag — tillfälle 4, utanför gränsen (count:3).
      expect(getDueRecurringTodoOccurrences([template], new Date("2026-06-17T08:00:00.000Z")).length).toBe(0);
    });

    test("'count' på årsvis återkommelse", () => {
      const template = createTodo({
        id: "todo-count-year",
        recurrence: {
          type: "recurring", unit: "year", every: 1, daysOfWeek: null,
          end: { type: "count", count: 1 }
        },
        visibleFrom: "2026-06-08T07:00:00.000Z"
      });
      expect(getDueRecurringTodoOccurrences([template], monday).length).toBe(1);
      expect(getDueRecurringTodoOccurrences([template], new Date("2027-06-08T08:00:00.000Z")).length).toBe(0);
    });
  });

  // 2026-07-08 (Zaidas önskemål om full fältparitet mellan skapa/redigera) —
  // redigerar man en daglig occurrence sparas mottagare/timerinställningar nu
  // till mallen, och den öppna dagens occurrence måste spegla det direkt.
  describe("applyTemplateToOccurrence", () => {
    test("synkar assignedTo/timerEnabled/plannedDurationMinutes från mallen", () => {
      const occurrence = createTodo({ id: "occ-1", occurrenceDate: "2026-06-08" });
      const template = createTodo({
        id: "todo-template",
        title: "Läxor",
        starValue: 5,
        assignedTo: "member-child-2",
        timerEnabled: true,
        plannedDurationMinutes: 15,
        visual: { type: "lucide-icon", value: "Book" },
        visibleFrom: "2026-06-01T07:00:00.000Z",
        expiresAt: "2026-06-01T08:00:00.000Z"
      });

      const patch = applyTemplateToOccurrence(occurrence, template);

      expect(patch.assignedTo).toBe("member-child-2");
      expect(patch.timerEnabled).toBe(true);
      expect(patch.plannedDurationMinutes).toBe(15);
      expect(patch.title).toBe("Läxor");
      expect(patch.starValue).toBe(5);
    });
  });
});
