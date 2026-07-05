import { z } from "zod";

export const IdSchema = z.string();

export const AppPanelSchema = z.enum(["home", "calendar", "shopping", "todos", "members", "settings"]);

export const CalendarViewModeSchema = z.enum(["month", "week", "list", "timeline"]);

// Partial<Record<CalendarFilterKey, ...>> — z.record().partial() finns inte i denna
// zod-version (ZodRecord saknar .partial(), bara ZodObject har den), och CalendarFilterKey
// har bara två kända nycklar, så ett explicit objekt uttrycker exakt samma typ.
export const CalendarFilterSettingsSchema = z.object({
  home: z.object({ visibleCalendarIds: z.array(IdSchema) }).optional(),
  calendar: z.object({ visibleCalendarIds: z.array(IdSchema) }).optional()
});

export const ChildTimelineSettingsSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string()
});

export const DashboardThemeIdSchema = z.enum([
  "space",
  "cosmic-cobalt",
  "lavender-blossom",
  "rainbow",
  "ocean",
  "forest",
  "superhero",
  "animal-park",
  "clear",
  "focus",
  "warm",
  "dark",
  "nature",
  "plunge-pool"
]);

export const MemberSchema = z.object({
  id: IdSchema,
  accountId: IdSchema,
  userId: IdSchema.nullable(),
  name: z.string().min(1, "Namn krävs"),
  roleId: IdSchema,
  isChild: z.boolean(),
  avatarUrl: z.string().nullable(),
  color: z.string().nullable(),
  dashboardTheme: DashboardThemeIdSchema.nullable(),
  calendarFilterSettings: CalendarFilterSettingsSchema.optional(),
  childTimelineSettings: ChildTimelineSettingsSchema.optional(),
  lastActivePanel: AppPanelSchema.optional(),
  lastSelectedDashboardMemberId: IdSchema.nullable().optional(),
  calendarView: CalendarViewModeSchema.optional(),
  spentStars: z.number().int().min(0),
  approvedStars: z.number().int().min(0),
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable()
});

// Fält en klient får patcha på en befintlig medlem. Uttryckligen uteslutna: id, accountId,
// userId, isChild (kontobyte/rollkapning/kontoflytt), approvedStars (får bara ökas via
// godkänd todo, aldrig direkt av klienten), deletedAt/deletedBy (egna dedikerade endpoints).
export const MemberPatchSchema = MemberSchema.pick({
  name: true,
  roleId: true,
  avatarUrl: true,
  color: true,
  dashboardTheme: true,
  calendarFilterSettings: true,
  childTimelineSettings: true,
  lastActivePanel: true,
  lastSelectedDashboardMemberId: true,
  calendarView: true,
  spentStars: true
}).partial();

// Fält en klient får skicka när en ny medlem skapas (barn, av en förälder). accountId,
// userId, spentStars, approvedStars, deletedAt/deletedBy sätts alltid server-side —
// aldrig litat på från klienten, se membersService.createMember.
export const CreateMemberBodySchema = MemberSchema.pick({
  name: true,
  roleId: true,
  isChild: true,
  avatarUrl: true,
  color: true,
  dashboardTheme: true
});

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
  isChildRole: z.boolean(),
  permissions: PermissionsSchema
});

export const PermissionsPatchSchema = PermissionsSchema.partial();

export const EventRecurrenceSchema = z.object({
  type: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1),
  until: z.string().nullable()
});

export const EventAttendeeSchema = z.object({
  memberId: IdSchema,
  status: z.enum(["pending", "accepted", "declined"])
});

export const CalendarEventSchema = z.object({
  id: IdSchema,
  calendarId: IdSchema,
  title: z.string().min(1, "Händelsetitel krävs"),
  startsAt: z.string(),
  endsAt: z.string(),
  isAllDay: z.boolean(),
  color: z.string().nullable(),
  uid: z.string().nullable(),
  subscriptionId: z.string().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  recurrence: EventRecurrenceSchema,
  attendees: z.array(EventAttendeeSchema),
  symbol: z.string().nullable(),
  createdBy: IdSchema,
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable()
});

// Fält en klient får patcha på en befintlig kalenderhändelse. calendarId/id/
// createdBy/deletedAt/deletedBy sätts av servern eller har egna dedikerade
// endpoints (delete/restore/rsvp), aldrig via den generiska PATCH-routen.
export const CalendarEventPatchSchema = CalendarEventSchema.pick({
  title: true,
  startsAt: true,
  endsAt: true,
  notes: true
}).partial();

export const ImportedCalendarSourceSchema = z.object({
  id: IdSchema,
  type: z.literal("ics-file"),
  name: z.string(),
  importedAt: z.string()
});

export const ShoppingItemSchema = z.object({
  id: IdSchema,
  title: z.string().min(1, "Varunamn krävs"),
  createdBy: IdSchema,
  done: z.boolean(),
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable()
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
  accountId: IdSchema.optional(),
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
  rejectedReason: z.string().nullable(),
  deletedAt: z.string().nullable(),
  deletedBy: IdSchema.nullable(),
  routineCategory: z.string().nullable().optional(),
  personalCategoryId: IdSchema.nullable().optional(),
  notes: z.string().nullable().optional()
});

// Fält en klient får patcha på en befintlig todo (titelredigering, rutinredigering via
// ChildRoutineCreator). completedAt/approvedBy/approvedAt/rejectedBy/rejectedAt/
// deletedAt/deletedBy får bara sättas till null och status bara till "pending" — det är
// den enda kombinationen "uppdatera rutin"-flödet (refreshRoutineOccurrence) behöver för
// att återställa en dagens-kopia, aldrig en riktig godkänn/neka/radera-väg (de har egna
// dedikerade endpoints: complete/approve/reject/delete/restore).
export const TodoPatchSchema = TodoSchema.pick({
  title: true,
  assignedTo: true,
  isShared: true,
  starValue: true,
  visual: true,
  recurrence: true,
  recurringSourceId: true,
  occurrenceDate: true,
  visibleFrom: true,
  expiresAt: true,
  routineCategory: true,
  personalCategoryId: true,
  notes: true
}).partial().extend({
  status: z.literal("pending").optional(),
  completedAt: z.null().optional(),
  approvedBy: z.null().optional(),
  approvedAt: z.null().optional(),
  rejectedBy: z.null().optional(),
  rejectedAt: z.null().optional(),
  deletedAt: z.null().optional(),
  deletedBy: z.null().optional()
});

export const RejectTodoBodySchema = z.object({
  reason: z.string().trim().min(1).max(200).nullable().optional()
});

// Flyttade hit från route-filerna (Sprint 3 S6) — låg tidigare som tre separata
// inline-scheman i analytics.ts/rewardShop.ts/rewards.ts.

export const AnalyticsEventNameSchema = z.enum([
  "todo-completed",
  "todo-approved",
  "calendar-event-added",
  "reward-redeemed",
  "wish-created",
  "wish-approved",
  "login",
  "shopping-item-checked",
  "timed-task-started",
  "timed-task-completed"
]);

export const TrackEventBodySchema = z.object({
  event: AnalyticsEventNameSchema
});

export const PurchasedRewardsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional()
});

export const AuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional()
});

export const RewardPatchSchema = z.object({
  title: z.string().min(1).optional(),
  starsNeeded: z.number().int().min(1).optional(),
  symbol: z.string().nullable().optional()
});

export const ApproveRewardBodySchema = z.object({
  starsNeeded: z.number().int().min(1)
});

// Medaljer/Rekord (Sprint 4 S1)

export const CreateTimedTaskBodySchema = z.object({
  title: z.string().min(1, "Titel krävs"),
  symbol: z.string().nullable().optional(),
  assignedTo: IdSchema
});

export const RecordTimedAttemptBodySchema = z.object({
  durationMs: z.number().int().min(1)
});
