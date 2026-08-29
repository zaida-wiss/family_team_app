import { describe, test, expect } from "vitest";
import {
  bucketCompletedStatsByDay,
  compareTodosByEndThenStart,
  getAssignedSubtaskCards,
  getFamilyCompletedTimelineItems,
  getFamilyViewTodos,
  getFamilyWeekRoutines,
  getMyTodosViewTodos,
  isTodoVisibleNow
} from "../src/features/todos/selectors";
import { createMember, createRole, createTodo } from "./testUtils";

// 2026-07-31, Zaidas önskemål: "i min egen todo vy skall endast mina egna
// todos finnas... Todos som tillhör familjen eller alla (vuxna) skall
// visas i familjevyn. Mina privata todos... skall inte visas i
// familjevyns todo." — se ParentTodoThreadView.tsx/MemberOverview.tsx.

const me = createMember("member-parent");
const otherAdult = createMember("member-other-adult");
const child = createMember("member-child", { isChild: true });
const roles = [createRole("role-member", [])];

// 2026-08-04, Zaidas önskemål: "visaren skall endast visas idag, så
// uppgifter som har gått ut, eller inte har börjat än skall inte visas" —
// exakt klockslags-gating, flyttad hit från MemberShellContent.tsx/
// ChildShellContent.tsx (som tidigare hade varsin identisk, lokal kopia) så
// ParentTodoThreadView.tsx/FamilyTodoThreads.tsx kan använda samma helper
// för "idag"-tidsspannet.
describe("isTodoVisibleNow", () => {
  const NOW = new Date("2026-08-04T12:00:00.000Z").getTime();

  test("en uppgift utan schema (visibleFrom/expiresAt null) är alltid synlig", () => {
    expect(isTodoVisibleNow({ visibleFrom: null, expiresAt: null }, NOW)).toBe(true);
  });

  test("en uppgift som ännu inte börjat (visibleFrom i framtiden) är INTE synlig", () => {
    expect(isTodoVisibleNow({ visibleFrom: "2026-08-04T13:00:00.000Z", expiresAt: null }, NOW)).toBe(false);
  });

  test("en uppgift som redan gått ut (expiresAt i det förflutna) är INTE synlig", () => {
    expect(isTodoVisibleNow({ visibleFrom: null, expiresAt: "2026-08-04T11:00:00.000Z" }, NOW)).toBe(false);
  });

  test("en uppgift mitt i sitt tidsfönster är synlig", () => {
    expect(
      isTodoVisibleNow({ visibleFrom: "2026-08-04T11:00:00.000Z", expiresAt: "2026-08-04T13:00:00.000Z" }, NOW)
    ).toBe(true);
  });
});

// 2026-08-13, Zaidas önskemål: "korten [på dashboarden] sorteras så att det
// som har närmast till sluttid skall komma först, de som inte har någon
// sluttid skall komma sist. som andra sortering skall de uppdrag med
// starttid först komma först (om sluttiden är exakt samma)" — delad av
// ChildShellContent.tsx/MemberShellContent.tsx.
describe("compareTodosByEndThenStart", () => {
  test("sluttid närmast i tiden kommer först", () => {
    const soon = createTodo({ id: "soon", expiresAt: "2026-08-13T10:00:00.000Z" });
    const later = createTodo({ id: "later", expiresAt: "2026-08-13T12:00:00.000Z" });
    expect([later, soon].sort(compareTodosByEndThenStart).map((t) => t.id)).toEqual(["soon", "later"]);
  });

  test("uppgifter utan sluttid hamnar sist, oavsett hur många som har sluttid", () => {
    const noEnd = createTodo({ id: "no-end", expiresAt: null });
    const withEnd = createTodo({ id: "with-end", expiresAt: "2026-08-13T10:00:00.000Z" });
    expect([noEnd, withEnd].sort(compareTodosByEndThenStart).map((t) => t.id)).toEqual(["with-end", "no-end"]);
  });

  test("vid exakt samma sluttid vinner tidigast starttid", () => {
    const laterStart = createTodo({
      id: "later-start",
      visibleFrom: "2026-08-13T09:00:00.000Z",
      expiresAt: "2026-08-13T12:00:00.000Z"
    });
    const earlierStart = createTodo({
      id: "earlier-start",
      visibleFrom: "2026-08-13T08:00:00.000Z",
      expiresAt: "2026-08-13T12:00:00.000Z"
    });
    expect([laterStart, earlierStart].sort(compareTodosByEndThenStart).map((t) => t.id)).toEqual([
      "earlier-start",
      "later-start"
    ]);
  });
});

describe("getMyTodosViewTodos", () => {
  test("en todo tilldelad mig visas, oavsett personlig kategori", () => {
    const todo = createTodo({ assignedTo: me.id, personalCategoryId: "cat-1" });
    expect(getMyTodosViewTodos(me, roles, [me, otherAdult, child], [todo], false)).toEqual([todo]);
  });

  test("en todo tilldelad mig, i en ANNAN vuxens kategori (eller ingen alls), visas ändå", () => {
    const noCategory = createTodo({ id: "todo-a", assignedTo: me.id, personalCategoryId: null });
    const othersCategory = createTodo({ id: "todo-b", assignedTo: me.id, personalCategoryId: "cat-other" });
    const result = getMyTodosViewTodos(me, roles, [me, otherAdult, child], [noCategory, othersCategory], false);
    expect(result.map((t) => t.id)).toEqual(["todo-a", "todo-b"]);
  });

  test("en todo tilldelad en ANNAN vuxen visas inte, även om jag skapade den", () => {
    const todo = createTodo({ assignedTo: otherAdult.id, createdBy: me.id });
    expect(getMyTodosViewTodos(me, roles, [me, otherAdult, child], [todo], false)).toEqual([]);
  });

  test("en Familjen-todo (assignedTo: null) visas inte, även om jag skapade den", () => {
    const todo = createTodo({ assignedTo: null, createdBy: me.id });
    expect(getMyTodosViewTodos(me, roles, [me, otherAdult, child], [todo], false)).toEqual([]);
  });

  test("en todo tilldelad ett barn visas bara när includeChildren är på", () => {
    const todo = createTodo({ assignedTo: child.id });
    expect(getMyTodosViewTodos(me, roles, [me, otherAdult, child], [todo], false)).toEqual([]);
    expect(getMyTodosViewTodos(me, roles, [me, otherAdult, child], [todo], true)).toEqual([todo]);
  });

  test("en mjuk-raderad todo visas aldrig", () => {
    const todo = createTodo({ assignedTo: me.id, deletedAt: "2026-07-31T00:00:00.000Z" });
    expect(getMyTodosViewTodos(me, roles, [me, otherAdult, child], [todo], false)).toEqual([]);
  });
});

const personalCategory = {
  id: "cat-1",
  accountId: "account-family",
  memberId: me.id,
  name: "Hushåll",
  createdAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  deletedBy: null
};
const familyCategory = { ...personalCategory, id: "cat-family", isFamily: true };

describe("getFamilyViewTodos", () => {
  test("en Familjen-todo (assignedTo: null) visas", () => {
    const todo = createTodo({ assignedTo: null, personalCategoryId: null });
    expect(getFamilyViewTodos([todo], roles, [me, otherAdult, child], [])).toEqual([todo]);
  });

  test("en todo tilldelad VILKEN VUXEN SOM HELST visas (inte bara mig)", () => {
    const mine = createTodo({ id: "todo-a", assignedTo: me.id, personalCategoryId: null });
    const others = createTodo({ id: "todo-b", assignedTo: otherAdult.id, personalCategoryId: null });
    const result = getFamilyViewTodos([mine, others], roles, [me, otherAdult, child], []);
    expect(result.map((t) => t.id)).toEqual(["todo-a", "todo-b"]);
  });

  test("en todo tilldelad ett barn visas INTE (bara 'alla vuxna')", () => {
    const todo = createTodo({ assignedTo: child.id, personalCategoryId: null });
    expect(getFamilyViewTodos([todo], roles, [me, otherAdult, child], [])).toEqual([]);
  });

  test("en todo med en PERSONLIG kategori visas ALDRIG, oavsett vem den är tilldelad", () => {
    const assignedToMe = createTodo({ id: "todo-a", assignedTo: me.id, personalCategoryId: "cat-1" });
    const unassigned = createTodo({ id: "todo-b", assignedTo: null, personalCategoryId: "cat-1" });
    expect(getFamilyViewTodos([assignedToMe, unassigned], roles, [me, otherAdult, child], [personalCategory])).toEqual([]);
  });

  // 2026-08-03, Zaidas önskemål om riktiga familjekategorier — en todo vars
  // personalCategoryId pekar på en kategori med isFamily:true hör hemma i
  // familjevyn, till skillnad från en personlig kategori (testet ovan).
  test("en todo med en FAMILJEKATEGORI (isFamily:true) visas", () => {
    const todo = createTodo({ assignedTo: null, personalCategoryId: "cat-family" });
    expect(getFamilyViewTodos([todo], roles, [me, otherAdult, child], [familyCategory])).toEqual([todo]);
  });

  test("en mjuk-raderad todo visas aldrig", () => {
    const todo = createTodo({ assignedTo: null, personalCategoryId: null, deletedAt: "2026-07-31T00:00:00.000Z" });
    expect(getFamilyViewTodos([todo], roles, [me, otherAdult, child], [])).toEqual([]);
  });
});

// 2026-08-12, Zaidas önskemål: "delmoment man är signad på hamnar på
// dashboarden, gärna emojin vid start med" — uppdragskort för DELMOMENT,
// se ChildTasksSection.tsx.
describe("getAssignedSubtaskCards", () => {
  const NOW = new Date("2026-08-12T12:00:00.000Z").getTime();

  test("ett obockat delmoment tilldelat mig ger ett kort, med emojin extraherad ur titeln", () => {
    const todo = createTodo({
      assignedTo: otherAdult.id,
      subtasks: [{ id: "sub-1", title: "🧺Plocka in i diskmaskinen", done: false, assignedTo: me.id }]
    });
    expect(getAssignedSubtaskCards(me.id, [todo], [], NOW)).toEqual([
      {
        todoId: todo.id,
        subtaskId: "sub-1",
        title: "Plocka in i diskmaskinen",
        emoji: "🧺",
        visibleFrom: null,
        expiresAt: null
      }
    ]);
  });

  test("ett delmoment tilldelat NÅGON ANNAN ger inget kort", () => {
    const todo = createTodo({
      subtasks: [{ id: "sub-1", title: "Dammsuga", done: false, assignedTo: otherAdult.id }]
    });
    expect(getAssignedSubtaskCards(me.id, [todo], [], NOW)).toEqual([]);
  });

  test("ett redan avbockat delmoment ger inget kort", () => {
    const todo = createTodo({
      subtasks: [{ id: "sub-1", title: "Dammsuga", done: true, assignedTo: me.id }]
    });
    expect(getAssignedSubtaskCards(me.id, [todo], [], NOW)).toEqual([]);
  });

  test("en todo utanför sitt tidsfönster ger inget kort för sina delmoment", () => {
    const todo = createTodo({
      visibleFrom: "2026-08-12T18:00:00.000Z",
      subtasks: [{ id: "sub-1", title: "Dammsuga", done: false, assignedTo: me.id }]
    });
    expect(getAssignedSubtaskCards(me.id, [todo], [], NOW)).toEqual([]);
  });

  test("en redan avklarad (approved) todos delmoment ger inget kort", () => {
    const todo = createTodo({
      status: "approved",
      subtasks: [{ id: "sub-1", title: "Dammsuga", done: false, assignedTo: me.id }]
    });
    expect(getAssignedSubtaskCards(me.id, [todo], [], NOW)).toEqual([]);
  });

  // 2026-08-13, Zaidas fråga: "har deluppgifterna fått huvuduppgiftens
  // sluttid?" — delmomentet har inget eget schema, kortet måste ärva
  // förälder-todons visibleFrom/expiresAt för att kunna sorteras in bland
  // de vanliga korten via compareTodosByEndThenStart.
  test("kortet ärver förälder-todons visibleFrom/expiresAt", () => {
    const todo = createTodo({
      visibleFrom: "2026-08-12T09:00:00.000Z",
      expiresAt: "2026-08-12T18:00:00.000Z",
      subtasks: [{ id: "sub-1", title: "Dammsuga", done: false, assignedTo: me.id }]
    });
    const [card] = getAssignedSubtaskCards(me.id, [todo], [], NOW);
    expect(card.visibleFrom).toBe("2026-08-12T09:00:00.000Z");
    expect(card.expiresAt).toBe("2026-08-12T18:00:00.000Z");
  });
});

// 2026-08-12, Zaidas önskemål: "hela familjens samlade avklarade todos
// (även deluppgifter)... vågrät tidslinje över dagen" — se
// FamilyCompletedTimeline.tsx.
describe("getFamilyCompletedTimelineItems", () => {
  const TODAY = new Date("2026-08-12T15:00:00.000Z");

  test("en avklarad (done, väntar godkännande) todo räknas, precis som ChildTimeline.tsx redan gör", () => {
    const todo = createTodo({ status: "done", completedAt: "2026-08-12T10:00:00.000Z" });
    const result = getFamilyCompletedTimelineItems([todo], TODAY);
    expect(result).toEqual([
      { id: `todo:${todo.id}`, title: todo.title, emoji: todo.visual.value, completedAt: todo.completedAt, assigneeId: todo.assignedTo }
    ]);
  });

  test("en godkänd (approved) todo räknas också", () => {
    const todo = createTodo({ status: "approved", completedAt: "2026-08-12T10:00:00.000Z" });
    expect(getFamilyCompletedTimelineItems([todo], TODAY)).toHaveLength(1);
  });

  test("en avklarad todo från en ANNAN dag räknas inte", () => {
    const todo = createTodo({ status: "approved", completedAt: "2026-08-11T10:00:00.000Z" });
    expect(getFamilyCompletedTimelineItems([todo], TODAY)).toEqual([]);
  });

  test("en fortfarande PENDING todo utan completedAt räknas inte", () => {
    const todo = createTodo({ status: "pending", completedAt: null });
    expect(getFamilyCompletedTimelineItems([todo], TODAY)).toEqual([]);
  });

  test("ett avklarat delmoment räknas OBEROENDE av hela todons egen status, emojin extraherad ur titeln", () => {
    const todo = createTodo({
      status: "pending",
      completedAt: null,
      subtasks: [{ id: "sub-1", title: "🧺Diska", done: true, completedAt: "2026-08-12T09:00:00.000Z", assignedTo: "mem-2" }]
    });
    const result = getFamilyCompletedTimelineItems([todo], TODAY);
    expect(result).toEqual([
      { id: `subtask:${todo.id}:sub-1`, title: "Diska", emoji: "🧺", completedAt: "2026-08-12T09:00:00.000Z", assigneeId: "mem-2" }
    ]);
  });

  test("ett obockat delmoment räknas inte", () => {
    const todo = createTodo({
      subtasks: [{ id: "sub-1", title: "Diska", done: false, completedAt: null, assignedTo: "mem-2" }]
    });
    expect(getFamilyCompletedTimelineItems([todo], TODAY)).toEqual([]);
  });

  test("resultatet sorteras kronologiskt på completedAt", () => {
    const early = createTodo({ id: "todo-early", status: "approved", completedAt: "2026-08-12T08:00:00.000Z" });
    const late = createTodo({ id: "todo-late", status: "approved", completedAt: "2026-08-12T18:00:00.000Z" });
    const result = getFamilyCompletedTimelineItems([late, early], TODAY);
    expect(result.map((r) => r.id)).toEqual([`todo:${early.id}`, `todo:${late.id}`]);
  });

  test("en mjuk-raderad todos avklarade delmoment räknas inte", () => {
    const todo = createTodo({
      deletedAt: "2026-08-12T09:00:00.000Z",
      subtasks: [{ id: "sub-1", title: "Diska", done: true, completedAt: "2026-08-12T09:00:00.000Z", assignedTo: "mem-2" }]
    });
    expect(getFamilyCompletedTimelineItems([todo], TODAY)).toEqual([]);
  });
});

describe("bucketCompletedStatsByDay", () => {
  const TODAY = new Date("2026-08-12T15:00:00.000Z");

  test("bucketerar rå completedAt-tidsstämplar per lokal dag, äldst först, N dagar tillbaka inklusive idag", () => {
    const result = bucketCompletedStatsByDay(
      ["2026-08-10T09:00:00.000Z", "2026-08-12T08:00:00.000Z", "2026-08-12T18:00:00.000Z"],
      TODAY,
      3
    );
    expect(result).toEqual([
      { dateStr: "2026-08-10", count: 1 },
      { dateStr: "2026-08-11", count: 0 },
      { dateStr: "2026-08-12", count: 2 }
    ]);
  });

  test("en dag utan några tidsstämplar alls får en egen 0-räknad bucket, inte hoppas över", () => {
    const result = bucketCompletedStatsByDay([], TODAY, 3);
    expect(result.map((b) => b.count)).toEqual([0, 0, 0]);
  });

  test("en tidsstämpel utanför fönstret räknas fortfarande om den råkar matcha en av bucketarnas dagsträng (inget filter i sig — anroparen ansvarar för att bara skicka in tidsstämplar inom fönstret)", () => {
    const result = bucketCompletedStatsByDay(["2020-01-01T00:00:00.000Z"], TODAY, 3);
    expect(result.every((b) => b.count === 0)).toBe(true);
  });
});

// 2026-08-29, Zaidas önskemål (efter en mockup-bild av ett nytt
// "familjeläge"): "ikoner på rutinerna, en liten rad per familjemedlem, de
// uppgifter som blivit gjorda skall markeras och de som inte blev gjorda
// skall dämpas" — FamilyWeekRoutines.tsx (Hem-vyns nya standardvy).
describe("getFamilyWeekRoutines", () => {
  // 2026-08-24 är en måndag (svensk veckostart, se startOfWeek i recurringTodos.ts).
  const MONDAY = new Date(2026, 7, 24);

  test("en mall due en given veckodag visas som en odämpad, ogjord ikon om ingen occurrence finns", () => {
    const template = createTodo({
      id: "template-1",
      assignedTo: "member-child",
      recurringSourceId: null,
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday"] },
      visibleFrom: "2026-08-01T00:00:00.000Z",
      visual: { type: "lucide-icon", value: "🦷" }
    });
    const days = getFamilyWeekRoutines([{ id: "member-child" }], [template], MONDAY);
    expect(days[0].dateStr).toBe("2026-08-24");
    expect(days[0].memberRows).toEqual([
      { memberId: "member-child", icons: [{ id: "template-1-2026-08-24", emoji: "🦷", title: "Testtodo", done: false }] }
    ]);
  });

  test("en dag utan matchande veckodag ger ingen medlemsrad alls", () => {
    const template = createTodo({
      id: "template-1",
      assignedTo: "member-child",
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["wednesday"] },
      visibleFrom: "2026-08-01T00:00:00.000Z"
    });
    const days = getFamilyWeekRoutines([{ id: "member-child" }], [template], MONDAY);
    expect(days[0].memberRows).toEqual([]);
    expect(days[2].dateStr).toBe("2026-08-26");
    expect(days[2].memberRows).toHaveLength(1);
  });

  test("en redan godkänd/klar occurrence markeras done, annars inte trots att den finns", () => {
    const template = createTodo({
      id: "template-1",
      assignedTo: "member-child",
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday"] },
      visibleFrom: "2026-08-01T00:00:00.000Z"
    });
    const doneOccurrence = createTodo({
      id: "template-1-occurrence-2026-08-24",
      assignedTo: "member-child",
      recurringSourceId: "template-1",
      occurrenceDate: "2026-08-24",
      status: "approved"
    });
    const days = getFamilyWeekRoutines([{ id: "member-child" }], [template, doneOccurrence], MONDAY);
    expect(days[0].memberRows[0].icons[0]).toMatchObject({ id: "template-1-occurrence-2026-08-24", done: true });
  });

  test("en uppgift utan återkommelse (recurrence: none) räknas aldrig som en rutin", () => {
    const oneOff = createTodo({ id: "one-off", assignedTo: "member-child", recurrence: { type: "none" } });
    const days = getFamilyWeekRoutines([{ id: "member-child" }], [oneOff], MONDAY);
    expect(days.every((d) => d.memberRows.length === 0)).toBe(true);
  });

  test("en Familjen-uppgift (assignedTo: null) räknas inte som någon medlems personliga rutin", () => {
    const familyTemplate = createTodo({
      id: "template-1",
      assignedTo: null,
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday"] },
      visibleFrom: "2026-08-01T00:00:00.000Z"
    });
    const days = getFamilyWeekRoutines([{ id: "member-child" }], [familyTemplate], MONDAY);
    expect(days[0].memberRows).toEqual([]);
  });
});
