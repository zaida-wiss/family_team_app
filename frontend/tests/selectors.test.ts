import { describe, test, expect } from "vitest";
import { getFamilyViewTodos, getMyTodosViewTodos } from "../src/features/todos/selectors";
import { createMember, createRole, createTodo } from "./testUtils";

// 2026-07-31, Zaidas önskemål: "i min egen todo vy skall endast mina egna
// todos finnas... Todos som tillhör familjen eller alla (vuxna) skall
// visas i familjevyn. Mina privata todos... skall inte visas i
// familjevyns todo." — se ParentTodoThreadView.tsx/MemberOverview.tsx.

const me = createMember("member-parent");
const otherAdult = createMember("member-other-adult");
const child = createMember("member-child", { isChild: true });
const roles = [createRole("role-member", [])];

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
