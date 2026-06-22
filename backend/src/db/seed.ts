import "dotenv/config";
import { connectDB } from "./connection.js";
import { AccountModel } from "./models/Account.js";
import { MemberModel } from "./models/Member.js";
import { RoleModel } from "./models/Role.js";
import { TodoModel } from "./models/Todo.js";
import { CalendarModel } from "./models/Calendar.js";
import { ShoppingListModel } from "./models/ShoppingList.js";
import { RewardModel } from "./models/Reward.js";

const allPermissions = [
  "canManageMembers", "canManageRoles", "canCreateChildAccounts", "canManageChildTodos",
  "canSeeAllTodos", "canSeeOwnTodos", "canCreateTodos", "canScheduleRecurringTodos",
  "canCompleteAssignedTodos", "canEditAnyTodos", "canDeleteAnyTodos", "canApproveTodos",
  "canSeeAllCalendar", "canSeeOwnCalendar", "canCreateCalendar", "canEditCalendar",
  "canImportCalendar", "canExportCalendar", "canSeeShoppingLists", "canCreateShoppingLists",
  "canEditShoppingLists", "canViewTrash", "canRestoreFromTrash"
] as const;

function makePermissions(enabled: string[]) {
  return Object.fromEntries(allPermissions.map((key) => [key, enabled.includes(key)]));
}

await connectDB();

await Promise.all([
  AccountModel.deleteMany({}),
  MemberModel.deleteMany({}),
  RoleModel.deleteMany({}),
  TodoModel.deleteMany({}),
  CalendarModel.deleteMany({}),
  ShoppingListModel.deleteMany({}),
  RewardModel.deleteMany({})
]);

await AccountModel.create({
  id: "account-family-1",
  name: "Testfamiljen",
  type: "family",
  createdBy: "member-foralder-1"
});

await RoleModel.create([
  {
    id: "role-foralder",
    name: "Förälder",
    isChildRole: false,
    permissions: makePermissions([
      "canManageMembers", "canManageRoles", "canCreateChildAccounts", "canManageChildTodos",
      "canSeeAllTodos", "canCreateTodos", "canScheduleRecurringTodos",
      "canEditAnyTodos", "canDeleteAnyTodos", "canApproveTodos",
      "canSeeAllCalendar", "canCreateCalendar", "canEditCalendar",
      "canImportCalendar", "canExportCalendar",
      "canSeeShoppingLists", "canCreateShoppingLists", "canEditShoppingLists",
      "canViewTrash", "canRestoreFromTrash"
    ])
  },
  {
    id: "role-barn",
    name: "Barn",
    isChildRole: true,
    permissions: makePermissions(["canSeeOwnTodos", "canCompleteAssignedTodos", "canSeeOwnCalendar"])
  }
]);

await MemberModel.create([
  {
    id: "member-foralder-1",
    accountId: "account-family-1",
    userId: null,
    name: "Förälder",
    roleId: "role-foralder",
    isChild: false,
    avatarUrl: null,
    dashboardTheme: "warm",
    deletedAt: null,
    deletedBy: null
  },
  {
    id: "member-barn-1",
    accountId: "account-family-1",
    userId: null,
    name: "Barn",
    roleId: "role-barn",
    isChild: true,
    avatarUrl: null,
    dashboardTheme: "space",
    deletedAt: null,
    deletedBy: null
  }
]);

await CalendarModel.create({
  id: "calendar-family",
  name: "Familjekalender",
  ownerId: "member-foralder-1",
  color: "#2f7d6d",
  sharedWith: [{ memberId: "member-barn-1", access: "view" }],
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
      createdBy: "member-foralder-1",
      deletedAt: null,
      deletedBy: null
    }
  ]
});

await ShoppingListModel.create({
  id: "shopping-1",
  name: "Veckohandling",
  ownerId: "member-foralder-1",
  color: "#f4a261",
  icon: "ShoppingCart",
  sharedWith: [{ memberId: "member-barn-1", access: "view" }],
  deletedAt: null,
  deletedBy: null,
  items: [
    { id: "shopping-item-1", title: "Mjölk", createdBy: "member-foralder-1", done: false, deletedAt: null, deletedBy: null },
    { id: "shopping-item-2", title: "Pasta", createdBy: "member-foralder-1", done: true, deletedAt: null, deletedBy: null }
  ]
});

await TodoModel.create([
  {
    id: "todo-1",
    title: "Bädda sängen",
    createdBy: "member-foralder-1",
    assignedTo: "member-barn-1",
    isShared: false,
    status: "pending",
    starValue: 2,
    visual: { type: "lucide-icon", value: "Bed" },
    recurrence: { type: "weekly", daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"] },
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
    title: "Läsa 20 minuter",
    createdBy: "member-foralder-1",
    assignedTo: "member-barn-1",
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
    createdBy: "member-foralder-1",
    assignedTo: "member-barn-1",
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
    approvedBy: "member-foralder-1",
    approvedAt: "2026-06-07T18:00:00",
    rejectedBy: null,
    rejectedAt: null,
    deletedAt: null,
    deletedBy: null
  }
]);

await RewardModel.create({
  id: "reward-1",
  title: "Bio med popcorn",
  wishedBy: "member-barn-1",
  starsNeeded: 20,
  status: "active",
  approvedBy: "member-foralder-1",
  approvedAt: "2026-06-08T18:00:00",
  redeemedAt: null,
  deletedAt: null,
  deletedBy: null
});

console.log("Seed klar!");
process.exit(0);
