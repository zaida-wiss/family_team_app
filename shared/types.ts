export type Id = string;

export type AccountType = "family" | "workplace";

export type Account = {
  id: Id;
  name: string;
  type: AccountType;
  createdBy: Id;
};

export type DashboardThemeId =
  | "space"
  | "rainbow"
  | "ocean"
  | "forest"
  | "superhero"
  | "animal-park"
  | "clear"
  | "focus"
  | "warm"
  | "dark"
  | "nature";

export type Member = {
  id: Id;
  accountId: Id;
  name: string;
  roleId: Id;
  isChild: boolean;
  avatarUrl: string | null;
  dashboardTheme: DashboardThemeId | null;
  deletedAt: string | null;
  deletedBy: Id | null;
};

export type PermissionKey =
  | "canManageMembers"
  | "canManageRoles"
  | "canSeeAllTodos"
  | "canSeeOwnTodos"
  | "canCreateTodos"
  | "canScheduleRecurringTodos"
  | "canCompleteAssignedTodos"
  | "canEditAnyTodos"
  | "canDeleteAnyTodos"
  | "canApproveTodos"
  | "canSeeAllCalendar"
  | "canSeeOwnCalendar"
  | "canCreateCalendar"
  | "canEditCalendar"
  | "canImportCalendar"
  | "canExportCalendar"
  | "canSeeShoppingLists"
  | "canCreateShoppingLists"
  | "canEditShoppingLists"
  | "canViewTrash"
  | "canRestoreFromTrash"
  | "canCreateChildAccounts"
  | "canManageChildTodos";

export type Role = {
  id: Id;
  name: string;
  permissions: Record<PermissionKey, boolean>;
};

export type AccessLevel = "view" | "edit";

export type ResourceShare = {
  memberId: Id;
  access: AccessLevel;
};

export type OwnedSharedResource = {
  ownerId: Id;
  sharedWith: ResourceShare[];
  deletedAt: string | null;
  deletedBy: Id | null;
};

export type Calendar = OwnedSharedResource & {
  id: Id;
  name: string;
  color: string;
  events: CalendarEvent[];
  importedSources: ImportedCalendarSource[];
};

export type CalendarEvent = {
  id: Id;
  calendarId: Id;
  title: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  createdBy: Id;
  deletedAt: string | null;
  deletedBy: Id | null;
};

export type ImportedCalendarSource = {
  id: Id;
  type: "ics-file";
  name: string;
  importedAt: string;
};

export type ShoppingList = OwnedSharedResource & {
  id: Id;
  name: string;
  color: string;
  icon: string | null;
  items: ShoppingItem[];
};

export type ShoppingItem = {
  id: Id;
  title: string;
  createdBy: Id;
  done: boolean;
  deletedAt: string | null;
  deletedBy: Id | null;
};

export type TodoStatus =
  | "pending"
  | "done"
  | "approved"
  | "rejected"
  | "expired";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type RecurrenceRule =
  | { type: "none" }
  | { type: "weekly"; daysOfWeek: Weekday[] }
  | { type: "interval"; every: number; unit: "day" | "week" };

export type TodoVisual = {
  type: "lucide-icon" | "image";
  value: string;
};

export type Todo = {
  id: Id;
  title: string;
  createdBy: Id;
  assignedTo: Id | null;
  isShared: boolean;
  status: TodoStatus;
  starValue: number;
  visual: TodoVisual;
  recurrence: RecurrenceRule;
  recurringSourceId: Id | null;
  occurrenceDate: string | null;
  visibleFrom: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  approvedBy: Id | null;
  approvedAt: string | null;
  rejectedBy: Id | null;
  rejectedAt: string | null;
  deletedAt: string | null;
  deletedBy: Id | null;
};

export type Reward = {
  id: Id;
  title: string;
  wishedBy: Id;
  starsNeeded: number;
  status: "suggested" | "active" | "unlocked" | "redeemed" | "rejected";
  approvedBy: Id | null;
  approvedAt: string | null;
  redeemedAt: string | null;
  deletedAt: string | null;
  deletedBy: Id | null;
};

export type RewardPathItem =
  | { type: "approved-star" }
  | { type: "pending-task"; todo: Todo };

export type RewardPathProgress = {
  childId: Id;
  rewardId: Id;
  approvedStars: number;
  pendingTaskImages: Todo[];
  rejectedTodos: Todo[];
  pathItems: RewardPathItem[];
  starsLeft: number;
  isUnlocked: boolean;
};
