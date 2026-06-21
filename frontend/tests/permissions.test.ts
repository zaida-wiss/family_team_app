import {
  canCompleteTodo,
  canDeleteTodo,
  canEditSharedResource,
  canEditTodo,
  canExportCalendar,
  canManageChildAccount,
  canViewResource,
  getShareAccess,
  hasPermission
} from "../src/features/roles/permissions.js";
import { createPermissionMap } from "../src/features/roles/permissionsConfig.js";
import type { Calendar, Member, Role, Todo } from "../../shared/types.js";
import { createMember, createTodo, expectEqual, type TestCase } from "./testUtils.js";

const parentRole: Role = {
  id: "role-parent",
  name: "Förälder",
  permissions: createPermissionMap([
    "canEditAnyTodos",
    "canDeleteAnyTodos",
    "canCompleteAssignedTodos",
    "canExportCalendar",
    "canManageChildTodos"
  ])
};

const childRole: Role = {
  id: "role-child",
  name: "Barn",
  permissions: createPermissionMap(["canCompleteAssignedTodos"])
};

const viewerRole: Role = {
  id: "role-viewer",
  name: "Läsare",
  permissions: createPermissionMap([])
};

const roles = [parentRole, childRole, viewerRole];

const parent = createMember("member-parent", { roleId: "role-parent" });
const child = createMember("member-child", {
  roleId: "role-child",
  isChild: true
});
const viewer = createMember("member-viewer", { roleId: "role-viewer" });
const outsiderChild = {
  ...createMember("member-outsider-child", {
    roleId: "role-child",
    isChild: true
  }),
  accountId: "account-other"
};

const ownedCalendar: Calendar = {
  id: "calendar-owned",
  name: "Privat",
  ownerId: parent.id,
  color: "#2f7d6d",
  sharedWith: [],
  importedSources: [],
  deletedAt: null,
  deletedBy: null,
  events: []
};

const sharedViewCalendar: Calendar = {
  ...ownedCalendar,
  id: "calendar-view",
  sharedWith: [{ memberId: child.id, access: "view" }]
};

const sharedEditCalendar: Calendar = {
  ...ownedCalendar,
  id: "calendar-edit",
  sharedWith: [{ memberId: child.id, access: "edit" }]
};

const assignedTodo: Todo = createTodo({
  id: "todo-assigned",
  createdBy: parent.id,
  assignedTo: child.id
});

const unassignedTodo: Todo = createTodo({
  id: "todo-other",
  createdBy: parent.id,
  assignedTo: viewer.id
});

const tests: TestCase[] = [
  {
    name: "hasPermission returns true only when the role enables the permission",
    run: () => {
      expectEqual(hasPermission(parent, roles, "canEditAnyTodos"), true);
      expectEqual(hasPermission(viewer, roles, "canEditAnyTodos"), false);
    }
  },
  {
    name: "getShareAccess gives owners edit access",
    run: () => {
      expectEqual(getShareAccess(parent, ownedCalendar), "edit");
    }
  },
  {
    name: "view shares can view but not edit",
    run: () => {
      expectEqual(canViewResource(child, sharedViewCalendar), true);
      expectEqual(canEditSharedResource(child, sharedViewCalendar), false);
    }
  },
  {
    name: "edit shares can edit shared resources",
    run: () => {
      expectEqual(canViewResource(child, sharedEditCalendar), true);
      expectEqual(canEditSharedResource(child, sharedEditCalendar), true);
    }
  },
  {
    name: "calendar export requires both export permission and edit access",
    run: () => {
      expectEqual(canExportCalendar(parent, roles, ownedCalendar), true);
      expectEqual(canExportCalendar(child, roles, sharedEditCalendar), false);
      expectEqual(canExportCalendar(viewer, roles, sharedEditCalendar), false);
    }
  },
  {
    name: "todo creators and admins can edit and delete todos",
    run: () => {
      expectEqual(canEditTodo(parent, roles, assignedTodo), true);
      expectEqual(canDeleteTodo(parent, roles, assignedTodo), true);
      expectEqual(canEditTodo(child, roles, assignedTodo), false);
      expectEqual(canDeleteTodo(child, roles, assignedTodo), false);
    }
  },
  {
    name: "assigned members can complete only their assigned todos when role allows it",
    run: () => {
      expectEqual(canCompleteTodo(child, roles, assignedTodo), true);
      expectEqual(canCompleteTodo(child, roles, unassignedTodo), false);
      expectEqual(canCompleteTodo(viewer, roles, unassignedTodo), false);
    }
  },
  {
    name: "adults can manage child accounts only in the same account and with permission",
    run: () => {
      expectEqual(canManageChildAccount(parent, child, roles), true);
      expectEqual(canManageChildAccount(parent, outsiderChild, roles), false);
      expectEqual(canManageChildAccount(viewer, child, roles), false);
    }
  }
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}
