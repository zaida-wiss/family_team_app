import { z } from "zod";

export const IdSchema = z.string();

export const AccountTypeSchema = z.enum(["family"]);

export const AccountSchema = z.object({
  id: IdSchema,
  name: z.string().min(1, "Kontonamn krävs"),
  type: AccountTypeSchema,
  createdBy: IdSchema
});

export const AppPanelSchema = z.enum(["home", "calendar", "shopping", "todos", "members", "settings"]);

export const CalendarViewModeSchema = z.enum(["month", "week", "list", "timeline"]);

export const CalendarFilterKeySchema = z.enum(["home", "calendar"]);

export const CalendarFilterSettingsSchema = z
  .record(CalendarFilterKeySchema, z.object({ visibleCalendarIds: z.array(IdSchema) }))
  .partial();

export const ChildTimelineSettingsSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string()
});

export const DashboardThemeIdSchema = z.enum([
  "space",
  "rainbow",
  "ocean",
  "forest",
  "superhero",
  "animal-park",
  "clear",
  "focus",
  "warm",
  "dark",
  "nature"
]);

export const MemberSchema = z.object({
  id: IdSchema,
  accountId: IdSchema,
  name: z.string().min(1, "Namn krävs"),
  roleId: IdSchema,
  isChild: z.boolean(),
  avatarUrl: z.string().nullable(),
  dashboardTheme: DashboardThemeIdSchema.nullable(),
  calendarFilterSettings: CalendarFilterSettingsSchema.optional(),
  childTimelineSettings: ChildTimelineSettingsSchema.optional(),
  lastActivePanel: AppPanelSchema.optional(),
  lastSelectedDashboardMemberId: IdSchema.nullable().optional(),
  calendarView: CalendarViewModeSchema.optional(),
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable()
});

export const PermissionKeySchema = z.enum([
  "canManageMembers",
  "canManageRoles",
  "canSeeAllTodos",
  "canSeeOwnTodos",
  "canCreateTodos",
  "canScheduleRecurringTodos",
  "canCompleteAssignedTodos",
  "canEditAnyTodos",
  "canDeleteAnyTodos",
  "canApproveTodos",
  "canSeeAllCalendar",
  "canSeeOwnCalendar",
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
]);

export const PermissionsSchema = z.object({
  canManageMembers: z.boolean(),
  canManageRoles: z.boolean(),
  canSeeAllTodos: z.boolean(),
  canSeeOwnTodos: z.boolean(),
  canCreateTodos: z.boolean(),
  canScheduleRecurringTodos: z.boolean(),
  canCompleteAssignedTodos: z.boolean(),
  canEditAnyTodos: z.boolean(),
  canDeleteAnyTodos: z.boolean(),
  canApproveTodos: z.boolean(),
  canSeeAllCalendar: z.boolean(),
  canSeeOwnCalendar: z.boolean(),
  canCreateCalendar: z.boolean(),
  canEditCalendar: z.boolean(),
  canImportCalendar: z.boolean(),
  canExportCalendar: z.boolean(),
  canSeeShoppingLists: z.boolean(),
  canCreateShoppingLists: z.boolean(),
  canEditShoppingLists: z.boolean(),
  canViewTrash: z.boolean(),
  canRestoreFromTrash: z.boolean(),
  canCreateChildAccounts: z.boolean(),
  canManageChildTodos: z.boolean()
});

export const RoleSchema = z.object({
  id: IdSchema,
  name: z.string().min(1, "Rollnamn krävs"),
  permissions: PermissionsSchema
});

export const AccessLevelSchema = z.enum(["view", "edit"]);

export const ResourceShareSchema = z.object({
  memberId: IdSchema,
  access: AccessLevelSchema
});

export const OwnedSharedResourceSchema = z.object({
  ownerId: IdSchema,
  sharedWith: z.array(ResourceShareSchema),
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable()
});

export const CalendarEventSchema = z.object({
  id: IdSchema,
  calendarId: IdSchema,
  title: z.string().min(1, "Händelsetitel krävs"),
  startsAt: z.string(),
  endsAt: z.string(),
  notes: z.string().nullable(),
  createdBy: IdSchema,
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable()
});

export const ImportedCalendarSourceSchema = z.object({
  id: IdSchema,
  type: z.literal("ics-file"),
  name: z.string(),
  importedAt: z.string()
});

export const CalendarSchema = OwnedSharedResourceSchema.extend({
  id: IdSchema,
  name: z.string().min(1, "Kalendernamn krävs"),
  color: z.string(),
  events: z.array(CalendarEventSchema),
  importedSources: z.array(ImportedCalendarSourceSchema)
});

export const ShoppingItemSchema = z.object({
  id: IdSchema,
  title: z.string().min(1, "Varunamn krävs"),
  createdBy: IdSchema,
  done: z.boolean(),
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable()
});

export const ShoppingListSchema = OwnedSharedResourceSchema.extend({
  id: IdSchema,
  name: z.string().min(1, "Listnamn krävs"),
  color: z.string(),
  icon: z.string().nullable(),
  items: z.array(ShoppingItemSchema)
});

export const TodoStatusSchema = z.enum([
  "pending",
  "done",
  "approved",
  "rejected",
  "expired"
]);

export const WeekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
]);

export const RecurrenceRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("weekly"), daysOfWeek: z.array(WeekdaySchema) }),
  z.object({
    type: z.literal("interval"),
    every: z.number().int().min(1),
    unit: z.enum(["day", "week"])
  })
]);

export const TodoVisualSchema = z.object({
  type: z.enum(["lucide-icon", "image"]),
  value: z.string()
});

export const TodoSchema = z.object({
  id: IdSchema,
  title: z.string().min(1, "Uppgiftstitel krävs"),
  createdBy: IdSchema,
  assignedTo: IdSchema.nullable(),
  isShared: z.boolean(),
  status: TodoStatusSchema,
  starValue: z.number().int().min(0),
  visual: TodoVisualSchema,
  recurrence: RecurrenceRuleSchema,
  recurringSourceId: IdSchema.nullable(),
  occurrenceDate: z.string().nullable(),
  visibleFrom: z.string().nullable(),
  expiresAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  approvedBy: IdSchema.nullable(),
  approvedAt: z.string().nullable(),
  rejectedBy: IdSchema.nullable(),
  rejectedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable()
});

export const RewardStatusSchema = z.enum([
  "suggested",
  "active",
  "unlocked",
  "redeemed",
  "rejected"
]);

export const RewardSchema = z.object({
  id: IdSchema,
  title: z.string().min(1, "Belöningsnamn krävs"),
  wishedBy: IdSchema,
  starsNeeded: z.number().int().min(1),
  status: RewardStatusSchema,
  approvedBy: IdSchema.nullable(),
  approvedAt: z.string().nullable(),
  redeemedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable()
});

export const RewardPathProgressSchema = z.object({
  childId: IdSchema,
  rewardId: IdSchema,
  approvedStars: z.number().int().min(0),
  pendingTaskImages: z.array(TodoSchema),
  starsLeft: z.number().int().min(0),
  isUnlocked: z.boolean()
});

export const CreateMemberInputSchema = MemberSchema.omit({ id: true, deletedAt: true, deletedBy: true });
export const CreateTodoInputSchema = TodoSchema.omit({
  id: true,
  status: true,
  recurringSourceId: true,
  occurrenceDate: true,
  completedAt: true,
  approvedBy: true,
  approvedAt: true,
  rejectedBy: true,
  rejectedAt: true,
  deletedAt: true,
  deletedBy: true
});
export const CreateCalendarInputSchema = z.object({
  name: z.string().min(1, "Kalendernamn krävs"),
  color: z.string().optional()
});
export const CreateShoppingListInputSchema = z.object({
  name: z.string().min(1, "Listnamn krävs")
});
export const CreateRewardInputSchema = RewardSchema.omit({
  id: true,
  status: true,
  approvedBy: true,
  approvedAt: true,
  redeemedAt: true,
  deletedAt: true,
  deletedBy: true
});
