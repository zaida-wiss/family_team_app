import { describe, test, expect } from "vitest";
import { getVisibleTodos } from "../src/features/todos/selectors";
import { getDeletedItemsForTrash, markDeleted, restoreDeleted } from "../src/features/trash/trash";
import { createCalendar, createMember, createRole, createShoppingList, createTodo } from "./testUtils";

const deletedAt = "2026-06-09T09:00:00";
const member = createMember("member-user", { roleId: "role-member" });
const admin = createMember("member-admin", { roleId: "role-admin" });
const noTrashAccessMember = createMember("member-no-trash", { roleId: "role-no-trash" });
const roles = [
  createRole("role-member", ["canViewTrash", "canSeeOwnTodos"]),
  createRole("role-admin", ["canViewTrash", "canRestoreFromTrash", "canSeeAllTodos"]),
  createRole("role-no-trash", [])
];

describe("trash", () => {
  test("markDeleted sets deletedAt and deletedBy", () => {
    const todo = createTodo({ id: "todo-delete-me" });
    const deletedTodo = markDeleted(todo, member.id, deletedAt);
    expect(deletedTodo.deletedAt).toBe(deletedAt);
    expect(deletedTodo.deletedBy).toBe(member.id);
  });

  test("restoreDeleted clears deletedAt and deletedBy", () => {
    const deletedTodo = createTodo({ id: "todo-restore-me", deletedAt, deletedBy: member.id });
    const restoredTodo = restoreDeleted(deletedTodo);
    expect(restoredTodo.deletedAt).toBeNull();
    expect(restoredTodo.deletedBy).toBeNull();
  });

  test("visible todo selector filters out deleted todos", () => {
    const visibleTodos = getVisibleTodos(member, roles, [
      createTodo({ id: "active-own", assignedTo: member.id, deletedAt: null, deletedBy: null }),
      createTodo({ id: "deleted-own", assignedTo: member.id, deletedAt, deletedBy: member.id })
    ]);
    expect(visibleTodos.length).toBe(1);
    expect(visibleTodos[0]?.id).toBe("active-own");
  });

  test("ordinary member sees only their own deleted trash items", () => {
    const trashItems = getDeletedItemsForTrash(
      [
        createTodo({ id: "own-deleted", deletedAt, deletedBy: member.id }),
        createTodo({ id: "other-deleted", deletedAt, deletedBy: admin.id }),
        createTodo({ id: "active", deletedAt: null, deletedBy: null })
      ],
      member,
      roles
    );
    expect(trashItems.length).toBe(1);
    expect(trashItems[0]?.id).toBe("own-deleted");
  });

  test("admin with restore permission sees every deleted trash item", () => {
    const trashItems = getDeletedItemsForTrash(
      [
        createTodo({ id: "member-deleted", deletedAt, deletedBy: member.id }),
        createTodo({ id: "admin-deleted", deletedAt, deletedBy: admin.id })
      ],
      admin,
      roles
    );
    expect(trashItems.length).toBe(2);
  });

  test("member without trash permission sees no trash items", () => {
    const trashItems = getDeletedItemsForTrash(
      [createTodo({ id: "hidden-deleted", deletedAt, deletedBy: noTrashAccessMember.id })],
      noTrashAccessMember,
      roles
    );
    expect(trashItems.length).toBe(0);
  });

  test("trash filtering works for calendars and shopping lists", () => {
    const calendars = getDeletedItemsForTrash(
      [
        createCalendar({ id: "calendar-own", deletedAt, deletedBy: member.id }),
        createCalendar({ id: "calendar-other", deletedAt, deletedBy: admin.id })
      ],
      member,
      roles
    );
    const shoppingLists = getDeletedItemsForTrash(
      [
        createShoppingList({ id: "shopping-own", deletedAt, deletedBy: member.id }),
        createShoppingList({ id: "shopping-other", deletedAt, deletedBy: admin.id })
      ],
      member,
      roles
    );
    expect(calendars.length).toBe(1);
    expect(calendars[0]?.id).toBe("calendar-own");
    expect(shoppingLists.length).toBe(1);
    expect(shoppingLists[0]?.id).toBe("shopping-own");
  });
});
