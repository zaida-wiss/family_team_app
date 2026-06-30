export type Id = string;

export type AccountType = "family";

export type CalendarSettings = {
  showWeekNumbers: boolean;
  showHolidays: boolean;
  holidayBgColor: string;
  holidayTextColor: string;
  subscriptionUrl: string | null;
};

export type Account = {
  id: Id;
  name: string;
  type: AccountType;
  createdBy: Id;
  deletedAt: string | null;
  calendarSettings?: CalendarSettings;
};

export type AppPanel =
  | "home"
  | "calendar"
  | "shopping"
  | "todos"
  | "members"
  | "settings";

export type CalendarViewMode = "month" | "week" | "list" | "timeline";

export type CalendarFilterKey = "home" | "calendar";

export type CalendarFilterSettings = Partial<Record<CalendarFilterKey, {
  visibleCalendarIds: Id[];
}>>;

export type ChildTimelineSettings = {
  startsAt: string;
  endsAt: string;
};

export type DashboardThemeId =
  | "space"
  | "cosmic-cobalt"
  | "lavender-blossom"
  | "rainbow"
  | "ocean"
  | "forest"
  | "superhero"
  | "animal-park"
  | "clear"
  | "focus"
  | "warm"
  | "dark"
  | "nature"
  | "plunge-pool";

export type User = {
  id: Id;
  email: string;
  name: string;
  createdAt: string;
  lastActiveMemberId?: Id | null;
};

export type Invitation = {
  id: Id;
  accountId: Id;
  invitedEmail: string;
  invitedByMemberId: Id;
  memberName: string;
  roleId: Id;
  isChild: boolean;
  token: string;
  status: "pending" | "accepted" | "expired";
  createdAt: string;
  expiresAt: string;
};

export type Membership = {
  member: Member;
  account: Account;
};

export type Member = {
  id: Id;
  accountId: Id;
  userId: Id | null;
  name: string;
  roleId: Id;
  isChild: boolean;
  avatarUrl: string | null;
  color: string | null;
  dashboardTheme: DashboardThemeId | null;
  calendarFilterSettings?: CalendarFilterSettings;
  childTimelineSettings?: ChildTimelineSettings;
  lastActivePanel?: AppPanel;
  lastSelectedDashboardMemberId?: Id | null;
  calendarView?: CalendarViewMode;
  spentStars: number;
  approvedStars: number;
  deletedAt: string | null;
  deletedBy: Id | null;
};

export type ShopTimeInterval = {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
};

export type ShopAvailability = {
  startDate: string | null;      // "YYYY-MM-DD" — null = inga datumgränser
  endDate: string | null;        // "YYYY-MM-DD" — null = inget slutdatum
  timeIntervals: ShopTimeInterval[]; // tom = tillgänglig hela dagen
};

// Default-förslag för todo-kategorier — föräldern väljer fritt bland dessa
// per belöning i RewardShopItem.requiredCategories.
export const ROUTINE_CATEGORIES = ["Hälsa", "Trivsel", "Pengar"] as const;

export type RewardShopItem = {
  id: Id;
  title: string;
  symbol: string | null;
  starCost: number;
  timerMinutes: number | null;
  availability: ShopAvailability | null; // null = alltid tillgänglig
  requiredCategories: string[]; // tom = ingen kategori-spärr
  createdBy: Id;
  deletedAt: string | null;
};

export type PurchasedReward = {
  id: Id;
  accountId: Id;
  memberId: Id;
  itemTitle: string;
  itemSymbol: string | null;
  starCost: number;
  purchasedAt: string;
  startsAt: string;
  durationMinutes: number | null;
  deletedAt: string | null;
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
  isChildRole: boolean;
  permissions: Record<PermissionKey, boolean>;
};

export type AccessLevel = "view" | "edit";

export type ResourceShare = {
  memberId: Id;
  access: AccessLevel;
};

export type OwnedSharedResource = {
  ownerId: Id;
  accountId?: Id;
  sharedWith: ResourceShare[];
  deletedAt: string | null;
  deletedBy: Id | null;
};

export type IcsSubscription = {
  id: Id;
  calendarId: Id;
  url: string;
  includeWords: string[];
  excludeWords: string[];
  dateFrom: string | null;
  dateTo: string | null;
  lastSyncedAt: string | null;
  displaySymbol: string | null;
};

export type Calendar = OwnedSharedResource & {
  id: Id;
  name: string;
  color: string;
  keepAllHistory?: boolean;
  events: CalendarEvent[];
  importedSources: ImportedCalendarSource[];
  subscriptions: IcsSubscription[];
};

export type EventRecurrence = {
  type: "none" | "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  until: string | null;
};

export type EventAttendee = {
  memberId: Id;
  status: "pending" | "accepted" | "declined";
};

export type CalendarEvent = {
  id: Id;
  calendarId: Id;
  title: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  color: string | null;
  uid: string | null;
  subscriptionId: string | null;
  location: string | null;
  notes: string | null;
  recurrence: EventRecurrence;
  attendees: EventAttendee[];
  symbol: string | null;
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
  accountId?: Id;
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
  routineCategory?: string | null;
};

export type Reward = {
  id: Id;
  accountId?: Id;
  title: string;
  symbol: string | null;
  wishedBy: Id;
  starsNeeded: number;
  status: "suggested" | "active" | "unlocked" | "redeemed" | "rejected";
  approvedBy: Id | null;
  approvedAt: string | null;
  redeemedAt: string | null;
  deletedAt: string | null;
  deletedBy: Id | null;
};

