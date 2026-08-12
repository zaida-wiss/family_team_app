import { describe, test, expect } from "vitest";
import { getAssignedSubtaskCards, getFamilyViewTodos, getMyTodosViewTodos, isTodoVisibleNow } from "../src/features/todos/selectors";
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
      { todoId: todo.id, subtaskId: "sub-1", title: "Plocka in i diskmaskinen", emoji: "🧺" }
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
});
