import { getVisibleTodos } from "../src/features/todos/selectors.js";
import {
  getDeletedItemsForTrash,
  markDeleted,
  restoreDeleted
} from "../src/features/trash/trash.js";
import {
  createCalendar,
  createMember,
  createRole,
  createShoppingList,
  createTodo,
  expectEqual,
  type TestCase
} from "./testUtils.js";

const deletedAt = "2026-06-09T09:00:00";
const member = createMember("member-user", { roleId: "role-member" });
const admin = createMember("member-admin", { roleId: "role-admin" });
const noTrashAccessMember = createMember("member-no-trash", {
  roleId: "role-no-trash"
});
const roles = [
  createRole("role-member", ["canViewTrash", "canSeeOwnTodos"]),
  createRole("role-admin", [
    "canViewTrash",
    "canRestoreFromTrash",
    "canSeeAllTodos"
  ]),
  createRole("role-no-trash", [])
];

const tests: TestCase[] = [
  {
    name: "markDeleted sets deletedAt and deletedBy",
    run: () => {
      const todo = createTodo({ id: "todo-delete-me" });
      const deletedTodo = markDeleted(todo, member.id, deletedAt);

      expectEqual(deletedTodo.deletedAt, deletedAt);
      expectEqual(deletedTodo.deletedBy, member.id);
    }
  },
  {
    name: "restoreDeleted clears deletedAt and deletedBy",
    run: () => {
      const deletedTodo = createTodo({
        id: "todo-restore-me",
        deletedAt,
        deletedBy: member.id
      });
      const restoredTodo = restoreDeleted(deletedTodo);

      expectEqual(restoredTodo.deletedAt, null);
      expectEqual(restoredTodo.deletedBy, null);
    }
  },
  {
    name: "visible todo selector filters out deleted todos",
    run: () => {
      const visibleTodos = getVisibleTodos(member, roles, [
        createTodo({
          id: "active-own",
          assignedTo: member.id,
          deletedAt: null,
          deletedBy: null
        }),
        createTodo({
          id: "deleted-own",
          assignedTo: member.id,
          deletedAt,
          deletedBy: member.id
        })
      ]);

      expectEqual(visibleTodos.length, 1);
      expectEqual(visibleTodos[0]?.id, "active-own");
    }
  },
  {
    name: "ordinary member sees only their own deleted trash items",
    run: () => {
      const trashItems = getDeletedItemsForTrash(
        [
          createTodo({
            id: "own-deleted",
            deletedAt,
            deletedBy: member.id
          }),
          createTodo({
            id: "other-deleted",
            deletedAt,
            deletedBy: admin.id
          }),
          createTodo({
            id: "active",
            deletedAt: null,
            deletedBy: null
          })
        ],
        member,
        roles
      );

      expectEqual(trashItems.length, 1);
      expectEqual(trashItems[0]?.id, "own-deleted");
    }
  },
  {
    name: "admin with restore permission sees every deleted trash item",
    run: () => {
      const trashItems = getDeletedItemsForTrash(
        [
          createTodo({
            id: "member-deleted",
            deletedAt,
            deletedBy: member.id
          }),
          createTodo({
            id: "admin-deleted",
            deletedAt,
            deletedBy: admin.id
          })
        ],
        admin,
        roles
      );

      expectEqual(trashItems.length, 2);
    }
  },
  {
    name: "member without trash permission sees no trash items",
    run: () => {
      const trashItems = getDeletedItemsForTrash(
        [
          createTodo({
            id: "hidden-deleted",
            deletedAt,
            deletedBy: noTrashAccessMember.id
          })
        ],
        noTrashAccessMember,
        roles
      );

      expectEqual(trashItems.length, 0);
    }
  },
  {
    name: "trash filtering works for calendars and shopping lists",
    run: () => {
      const calendars = getDeletedItemsForTrash(
        [
          createCalendar({
            id: "calendar-own",
            deletedAt,
            deletedBy: member.id
          }),
          createCalendar({
            id: "calendar-other",
            deletedAt,
            deletedBy: admin.id
          })
        ],
        member,
        roles
      );
      const shoppingLists = getDeletedItemsForTrash(
        [
          createShoppingList({
            id: "shopping-own",
            deletedAt,
            deletedBy: member.id
          }),
          createShoppingList({
            id: "shopping-other",
            deletedAt,
            deletedBy: admin.id
          })
        ],
        member,
        roles
      );

      expectEqual(calendars.length, 1);
      expectEqual(calendars[0]?.id, "calendar-own");
      expectEqual(shoppingLists.length, 1);
      expectEqual(shoppingLists[0]?.id, "shopping-own");
    }
  }
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}
