import { describe, test, expect } from "vitest";
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
} from "../src/utils/permissions";
import { createPermissionMap } from "../src/features/roles/permissionsConfig";
import type { Calendar, Role, Todo } from "../../shared/types";
import { createMember, createTodo } from "./testUtils";

const parentRole: Role = {
  id: "role-parent",
  name: "Förälder",
  isChildRole: false,
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
  isChildRole: true,
  permissions: createPermissionMap(["canCompleteAssignedTodos"])
};

const viewerRole: Role = {
  id: "role-viewer",
  name: "Läsare",
  isChildRole: false,
  permissions: createPermissionMap([])
};

const roles = [parentRole, childRole, viewerRole];

const parent = createMember("member-parent", { roleId: "role-parent" });
const child = createMember("member-child", { roleId: "role-child", isChild: true });
const viewer = createMember("member-viewer", { roleId: "role-viewer" });
const outsiderChild = {
  ...createMember("member-outsider-child", { roleId: "role-child", isChild: true }),
  accountId: "account-other"
};

const ownedCalendar: Calendar = {
  id: "calendar-owned",
  name: "Privat",
  ownerId: parent.id,
  color: "#2f7d6d",
  sharedWith: [],
  importedSources: [],
  subscriptions: [],
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

const assignedTodo: Todo = createTodo({ id: "todo-assigned", createdBy: parent.id, assignedTo: child.id });
const unassignedTodo: Todo = createTodo({ id: "todo-other", createdBy: parent.id, assignedTo: viewer.id });

describe("permissions", () => {
  test("hasPermission returns true only when the role enables the permission", () => {
    expect(hasPermission(parent, roles, "canEditAnyTodos")).toBe(true);
    expect(hasPermission(viewer, roles, "canEditAnyTodos")).toBe(false);
  });

  test("getShareAccess gives owners edit access", () => {
    expect(getShareAccess(parent, ownedCalendar)).toBe("edit");
  });

  test("view shares can view but not edit", () => {
    expect(canViewResource(child, sharedViewCalendar)).toBe(true);
    expect(canEditSharedResource(child, sharedViewCalendar)).toBe(false);
  });

  test("edit shares can edit shared resources", () => {
    expect(canViewResource(child, sharedEditCalendar)).toBe(true);
    expect(canEditSharedResource(child, sharedEditCalendar)).toBe(true);
  });

  test("calendar export requires both export permission and edit access", () => {
    expect(canExportCalendar(parent, roles, ownedCalendar)).toBe(true);
    expect(canExportCalendar(child, roles, sharedEditCalendar)).toBe(false);
    expect(canExportCalendar(viewer, roles, sharedEditCalendar)).toBe(false);
  });

  test("todo creators and admins can edit and delete todos", () => {
    expect(canEditTodo(parent, roles, assignedTodo)).toBe(true);
    expect(canDeleteTodo(parent, roles, assignedTodo)).toBe(true);
    expect(canEditTodo(child, roles, assignedTodo)).toBe(false);
    expect(canDeleteTodo(child, roles, assignedTodo)).toBe(false);
  });

  test("assigned members can complete only their assigned todos when role allows it", () => {
    expect(canCompleteTodo(child, roles, assignedTodo)).toBe(true);
    expect(canCompleteTodo(child, roles, unassignedTodo)).toBe(false);
    expect(canCompleteTodo(viewer, roles, unassignedTodo)).toBe(false);
  });

  test("adults can manage child accounts only in the same account and with permission", () => {
    expect(canManageChildAccount(parent, child, roles)).toBe(true);
    expect(canManageChildAccount(parent, outsiderChild, roles)).toBe(false);
    expect(canManageChildAccount(viewer, child, roles)).toBe(false);
  });
});
