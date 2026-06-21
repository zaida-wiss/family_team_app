import type {
  Account,
  Calendar,
  Member,
  Reward,
  Role,
  ShoppingList,
  Todo
} from "@shared/types";
import { createPermissionMap } from "../features/roles/permissionsConfig";

export const accounts: Account[] = [
  {
    id: "account-family-1",
    name: "Familjen Solbacken",
    type: "family",
    createdBy: "member-parent-1"
  }
];

export const roles: Role[] = [
  {
    id: "role-parent",
    name: "Foralder",
    permissions: createPermissionMap([
      "canManageMembers",
      "canManageRoles",
      "canSeeAllTodos",
      "canCreateTodos",
      "canScheduleRecurringTodos",
      "canEditAnyTodos",
      "canDeleteAnyTodos",
      "canApproveTodos",
      "canSeeAllCalendar",
      "canCreateCalendar",
      "canEditCalendar",
      "canImportCalendar",
      "canExportCalendar",
      "canSeeShoppingLists",
      "canCreateShoppingLists",
      "canEditShoppingLists",
      "canViewTrash",
      "canRestoreFromTrash",
      "canCreateChildAccounts",
      "canManageChildTodos"
    ])
  },
  {
    id: "role-child",
    name: "Barn",
    permissions: createPermissionMap([
      "canSeeOwnTodos",
      "canCompleteAssignedTodos",
      "canSeeOwnCalendar"
    ])
  }
];

export const members: Member[] = [
  {
    id: "member-parent-1",
    accountId: "account-family-1",
    name: "Zaida",
    roleId: "role-parent",
    isChild: false,
    avatarUrl: null,
    dashboardTheme: "warm",
    deletedAt: null,
    deletedBy: null
  },
  {
    id: "member-child-1",
    accountId: "account-family-1",
    name: "Sam",
    roleId: "role-child",
    isChild: true,
    avatarUrl: null,
    dashboardTheme: "space",
    deletedAt: null,
    deletedBy: null
  }
];

export const calendars: Calendar[] = [
  {
    id: "calendar-family",
    name: "Familjekalender",
    ownerId: "member-parent-1",
    color: "#2f7d6d",
    sharedWith: [{ memberId: "member-child-1", access: "view" }],
    importedSources: [],
    deletedAt: null,
    deletedBy: null,
    events: [
      {
        id: "event-1",
        calendarId: "calendar-family",
        title: "Simskola",
        startsAt: "2026-06-10T17:00:00",
        endsAt: "2026-06-10T18:00:00",
        notes: null,
        createdBy: "member-parent-1",
        deletedAt: null,
        deletedBy: null
      }
    ]
  }
];

export const shoppingLists: ShoppingList[] = [
  {
    id: "shopping-1",
    name: "Veckohandling",
    ownerId: "member-parent-1",
    color: "#f4a261",
    icon: "ShoppingCart",
    sharedWith: [{ memberId: "member-child-1", access: "view" }],
    deletedAt: null,
    deletedBy: null,
    items: [
      {
        id: "shopping-item-1",
        title: "Mjolk",
        createdBy: "member-parent-1",
        done: false,
        deletedAt: null,
        deletedBy: null
      },
      {
        id: "shopping-item-2",
        title: "Pasta",
        createdBy: "member-parent-1",
        done: true,
        deletedAt: null,
        deletedBy: null
      }
    ]
  }
];

export const todos: Todo[] = [
  {
    id: "todo-1",
    title: "Badda sangen",
    createdBy: "member-parent-1",
    assignedTo: "member-child-1",
    isShared: false,
    status: "pending",
    starValue: 2,
    visual: { type: "lucide-icon", value: "Bed" },
    recurrence: {
      type: "weekly",
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"]
    },
    recurringSourceId: null,
    occurrenceDate: null,
    visibleFrom: "2026-06-10T07:00:00",
    expiresAt: "2026-06-10T09:00:00",
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    deletedAt: null,
    deletedBy: null
  },
  {
    id: "todo-2",
    title: "Lasa 20 minuter",
    createdBy: "member-parent-1",
    assignedTo: "member-child-1",
    isShared: false,
    status: "done",
    starValue: 3,
    visual: { type: "lucide-icon", value: "BookOpen" },
    recurrence: { type: "none" },
    recurringSourceId: null,
    occurrenceDate: null,
    visibleFrom: null,
    expiresAt: null,
    completedAt: "2026-06-08T18:00:00",
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    deletedAt: null,
    deletedBy: null
  },
  {
    id: "todo-3",
    title: "Duka bordet",
    createdBy: "member-parent-1",
    assignedTo: "member-child-1",
    isShared: false,
    status: "approved",
    starValue: 4,
    visual: { type: "lucide-icon", value: "Utensils" },
    recurrence: { type: "none" },
    recurringSourceId: null,
    occurrenceDate: null,
    visibleFrom: null,
    expiresAt: null,
    completedAt: "2026-06-07T17:30:00",
    approvedBy: "member-parent-1",
    approvedAt: "2026-06-07T18:00:00",
    rejectedBy: null,
    rejectedAt: null,
    deletedAt: null,
    deletedBy: null
  }
];

export const rewards: Reward[] = [
  {
    id: "reward-1",
    title: "Bio med popcorn",
    wishedBy: "member-child-1",
    starsNeeded: 20,
    status: "active",
    approvedBy: "member-parent-1",
    approvedAt: "2026-06-08T18:00:00",
    redeemedAt: null,
    deletedAt: null,
    deletedBy: null
  }
];
