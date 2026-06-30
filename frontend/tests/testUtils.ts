import type {
  Calendar,
  Member,
  Reward,
  Role,
  ShoppingList,
  Todo
} from "../../shared/types";
import { createPermissionMap } from "../src/features/roles/permissionsConfig.js";

export function createMember(
  id: string,
  overrides: Partial<Member> = {}
): Member {
  return {
    id,
    accountId: "account-family",
    userId: null,
    name: id,
    roleId: "role-member",
    isChild: false,
    avatarUrl: null,
    color: null,
    spentStars: 0,
    approvedStars: 0,
    dashboardTheme: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides
  };
}

export function createRole(
  id: string,
  permissions: Parameters<typeof createPermissionMap>[0] = []
): Role {
  return {
    id,
    name: id,
    isChildRole: false,
    permissions: createPermissionMap(permissions)
  };
}

export function createCalendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: "calendar-1",
    name: "Kalender",
    ownerId: "member-parent",
    color: "#2f7d6d",
    sharedWith: [],
    importedSources: [],
    subscriptions: [],
    deletedAt: null,
    deletedBy: null,
    events: [],
    ...overrides
  };
}

export function createShoppingList(
  overrides: Partial<ShoppingList> = {}
): ShoppingList {
  return {
    id: "shopping-1",
    name: "Inköp",
    ownerId: "member-parent",
    color: "#2f7d6d",
    icon: "ShoppingCart",
    sharedWith: [],
    deletedAt: null,
    deletedBy: null,
    items: [],
    ...overrides
  };
}

export function createReward(overrides: Partial<Reward> = {}): Reward {
  return {
    id: "reward-1",
    title: "Belöning",
    wishedBy: "member-child",
    starsNeeded: 10,
    status: "active",
    approvedBy: "member-parent",
    approvedAt: "2026-06-09T08:00:00",
    redeemedAt: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
    symbol: overrides.symbol ?? null,
  };
}

export function createTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "todo-1",
    title: "Testtodo",
    createdBy: "member-parent",
    assignedTo: "member-child",
    isShared: false,
    status: "pending",
    starValue: 1,
    visual: { type: "lucide-icon", value: "Check" },
    recurrence: { type: "none" },
    recurringSourceId: null,
    occurrenceDate: null,
    visibleFrom: null,
    expiresAt: null,
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides
  };
}
