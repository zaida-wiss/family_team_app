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

export type TodoViewMode = "list" | "thread";

// Hur mycket som visas i "bollar i tråd" (2026-07-06, Zaidas begäran: "bara
// idag, en vecka, en månad, eller en lång lista på allt i framtiden") — bara
// tråd-vyn (bubblorna), listläget har aldrig haft ett datumfilter alls.
export type TodoThreadRange = "today" | "week" | "month" | "all";

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
  | "plunge-pool"
  | "sunset"
  | "turquoise"
  | "lagoon"
  | "orchid"
  | "dusk";

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
  // Todos-panelens visningsläge (lista/tråd) — väljs i Inställningar, ingen
  // egen växlare i panelen (2026-07-05, Zaidas beslut: panelen ska bara visa
  // kategori/+-knappen/todouppgifterna). Standard "thread" om osatt.
  todoViewMode?: TodoViewMode;
  // Ordningen på trådarna i vuxenvyns "bollar i tråd" (2026-07-06, Zaidas
  // önskemål om drag-and-drop) — en lista av tråd-id:n (kategori-id:n plus
  // sentinelen "__children__" för den gemensamma Barn-tråden). Trådar som
  // saknas i listan (t.ex. en nyskapad kategori) hamnar sist, i sin vanliga
  // ordning. Saknas fältet helt = ingen anpassad ordning ännu.
  todoThreadOrder?: Id[];
  // Hur mycket som visas i tråd-vyn (2026-07-06, Zaidas önskemål) — väljs i
  // Inställningar, samma mönster som todoViewMode. Standard "today" om osatt.
  todoThreadRange?: TodoThreadRange;
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

export type RewardShopItem = {
  id: Id;
  title: string;
  symbol: string | null;
  starCost: number;
  timerMinutes: number | null;
  availability: ShopAvailability | null; // null = alltid tillgänglig
  // TodoCategory-id:n (2026-07-08, ADR-0020 — ersätter det tidigare fasta
  // Hälsa/Trivsel/Pengar-namnbaserade settet). Föräldern väljer fritt bland
  // de riktiga kategorier som redan används på barnens uppgifter — samma
  // "Egen kategori"-system som resten av appen, inget separat fast enum.
  requiredCategories: Id[]; // tom = ingen kategori-spärr
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

export type PaginatedPurchasedRewards = {
  items: PurchasedReward[];
  page: number;
  pageSize: number;
  total: number;
};

// Audit-logg (Sprint 5 S4) — spårar stjärnor/köp/rolländringar. summary är
// förformaterad server-side vid skrivning (svenska, klar för visning) — enklare
// än en generisk details-bag som varje klientvy skulle behöva formatera per typ.
export type AuditLogAction = "stars_approved" | "reward_purchased" | "role_permissions_changed";

export type AuditLogEntry = {
  id: Id;
  accountId: Id;
  action: AuditLogAction;
  actorMemberId: Id | null;
  summary: string;
  createdAt: string;
};

export type PaginatedAuditLog = {
  items: AuditLogEntry[];
  page: number;
  pageSize: number;
  total: number;
};

// Medaljer/Rekord (Sprint 4 S1) — helt skild från Todo/belöningsflödet, se
// docs/engineering-os/.../discussions/2026-07-04-designspike-medaljer-och-foraldravy.md.
// Start/stopp mäts klientsidan (Date.now()); bara den färdiga varaktigheten skickas
// till servern — inget "pågående försök"-tillstånd att tappa bort om fliken stängs.
export type TimedTask = {
  id: Id;
  accountId: Id;
  title: string;
  symbol: string | null;
  assignedTo: Id;
  createdBy: Id;
  deletedAt: string | null;
  deletedBy: Id | null;
};

export type TimedAttempt = {
  id: Id;
  timedTaskId: Id;
  memberId: Id;
  durationMs: number;
  achievedAt: string;
  isNewRecord: boolean;
};

export type TimedTaskWithBest = TimedTask & {
  bestDurationMs: number | null;
  bestAchievedAt: string | null;
  attemptCount: number;
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
  accountId: Id;
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

// "year" tillagt 2026-07-07 (Zaidas önskemål, t.ex. födelsedagar/årliga
// hälsokontroller) — kalenderns egna händelser hade redan "yearly" sedan
// tidigare, en rimlig lucka att täppa till för todos också.
export type RecurrenceUnit = "day" | "week" | "month" | "year";

// Slutvillkor för en återkommande serie (2026-07-07, Zaidas önskemål: "en
// sluttid med datum, alternativt hur många gånger det ska upprepa sig").
// Valfritt fält (se RecurrenceRule nedan) — saknas det (befintlig data från
// innan denna ändring) tolkas det som "never" (repeterar för evigt, oförändrat
// beteende). Mallen ligger kvar och syns i Inställningar → Återkommande
// uppgifter även efter att slutvillkoret nåtts — den slutar bara generera nya
// dagliga bollar, försvinner inte (Zaidas beslut).
export type RecurrenceEnd =
  | { type: "never" }
  | { type: "until"; date: string }
  | { type: "count"; count: number };

// Ersätter (2026-07-05, ADR) de tidigare separata "weekly"/"interval"-formerna
// med en enda kombinerad form — enhet + intervall (varannan/var tredje osv)
// + valfria veckodagar, likt Google Kalenders återkommelse-modell. daysOfWeek
// är satt (icke-tom) endast när unit === "week", annars alltid null — se
// RecurrenceRuleSchema i schemas.ts för valideringen av detta samband.
export type RecurrenceRule =
  | { type: "none" }
  | { type: "recurring"; unit: RecurrenceUnit; every: number; daysOfWeek: Weekday[] | null; end?: RecurrenceEnd };

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
  rejectedReason: string | null;
  deletedAt: string | null;
  deletedBy: Id | null;
  // Föräldravyn med delmoment (Sprint 6) — valfritt, lika vikt (procent = avbockade
  // / totalt). Påverkar inte befintlig todo-logik (listning, godkännande, historik)
  // när det saknas, se discussions/2026-07-04-designspike-medaljer-och-foraldravy.md.
  subtasks?: TodoSubtask[];
  // Kontobred, fritt namngiven kategori (2026-07-05) — refererar en TodoCategory.
  // Sedan ADR-0020 (2026-07-08) det ENDA kategorisystemet på Todo — ersätter det
  // tidigare separata, fasta routineCategory/ROUTINE_CATEGORIES-fältet (Hälsa/
  // Trivsel/Pengar), som drev belöningsbutikens kategori-spärr och barnens
  // rutinskapare. Se migrateRoutineCategoryToPersonalCategory.ts för migreringen
  // av befintlig produktionsdata.
  personalCategoryId?: Id | null;
  // Fritextanteckningar (2026-07-05), redigerbara via TodoDetailModal. Krypterat
  // (ADR-0014), samma mönster som title/rejectedReason.
  notes?: string | null;
  // Flera tidsintervall per dag på samma återkommande uppgift (2026-07-05,
  // Zaidas önskemål, t.ex. "borsta tänder" morgon OCH kväll som EN mall).
  // Valfritt och bakåtkompatibelt — saknas fältet (eller är tomt) genererar
  // recurringTodos.ts precis som tidigare EN occurrence/dag från
  // visibleFrom/expiresAt direkt på mallen. Är fältet satt med flera poster
  // genererar en mall en occurrence PER tidsintervall PER förfallodag,
  // oberoende av varandras avklarmarkering. Bara meningsfullt på en
  // återkommande MALL (recurringSourceId === null) — ignoreras på occurrences.
  timeWindows?: TodoTimeWindow[];
  // Timerfunktion (2026-07-07, Zaidas önskemål: "hur lång tid det tar att
  // göra todo" — uttryckligen SKILT från visibleFrom/expiresAt, som styr NÄR
  // uppgiften visas). Helt separat, enklare system än TimedTask/TimedAttempt
  // (Medaljer/Rekord) — ingen upprepad personbästa-jämförelse, bara EN
  // inspelad tid för just detta tillfälle. Samma "klienten mäter, ingen
  // server-side pågående-status"-mönster som TimedTask redan använder —
  // stänger man fliken mitt i en pågående timer förloras den bara, ingen
  // återupptagning. Valfritt och bakåtkompatibelt.
  timerEnabled?: boolean;
  // Planerad tid i MINUTER (samma enhet/mönster som RewardShopItem.timerMinutes)
  // — sätts av föräldern vid skapande. Är detta satt visar barnets uppgiftskort
  // en NEDRÄKNING (dubbelklick startar, räknar ner mot noll) istället för den
  // öppna uppåträknande tidtagningen (2026-07-07, Zaidas förtydligande: "jag
  // menar en timer, där bordet visar hur lång tid som är kvar" — inte en
  // tidtagning). Saknas fältet (eller är null) faller kortet tillbaka på den
  // ursprungliga öppna tidtagningen (Starta/Klar-knappar, räknar uppåt).
  plannedDurationMinutes?: number | null;
  elapsedMs?: number | null;
};

export type TodoTimeWindow = {
  visibleFrom: string | null;
  expiresAt: string | null;
};

export type TodoSubtask = {
  id: Id;
  title: string;
  done: boolean;
};

// Vuxenvyns egna, personliga kategori-trådar (2026-07-05) — en medlem kan skapa
// sina egna kategorier för att organisera sina egna todos i sida-vid-sida-trådar.
// Kontobred sedan ADR-0019 (2026-07-07) — alla vuxna ser/redigerar varandras.
// Sedan ADR-0020 (2026-07-08) samma system som driver belöningsbutikens
// kategori-spärr och barnens rutinskapare (ersätter det tidigare separata,
// fasta routineCategory-fältet).
export type TodoCategory = {
  id: Id;
  accountId: Id;
  memberId: Id;
  name: string;
  createdAt: string;
  // Gömd (2026-07-05) — skiljer sig från deletedAt/radering: en gömd kategori
  // syns inte i tråd-vyn men finns kvar oförändrad, kan visas igen när som
  // helst via Inställningar. Valfritt/saknas = inte gömd (bakåtkompatibelt,
  // ingen migrering av befintliga kategorier behövs).
  hidden?: boolean;
  deletedAt: string | null;
  deletedBy: Id | null;
};

// Mallbibliotek (2026-07-08, Zaidas önskemål: "det är ingen vits med att spara
// gamla avklarade kopior... jag vill spara både återkommande uppgifter och
// hela kategorier som mall för fler tillfällen då jag får en kopia"). En mall
// är alltid "fryst" — den lever helt oberoende av den ursprungliga uppgiften/
// kategorin den skapades från, och rörs inte om originalet senare redigeras
// eller raderas.
export type TodoTemplateTask = {
  title: string;
  visual: TodoVisual;
  // Bara titlar — en färsk kopia från en mall ska alltid börja obockad, det
  // finns ingen mening att spara done-status i en mall.
  subtasks: { title: string }[];
  recurrence: RecurrenceRule;
  starValue: number;
};

// Fristående uppgiftsmall (kan hämtas oberoende av kategori, t.ex. via "Lägg
// till uppgift" i valfri tråd).
export type TodoTemplate = TodoTemplateTask & {
  id: Id;
  accountId: Id;
  memberId: Id;
  createdAt: string;
  deletedAt: string | null;
  deletedBy: Id | null;
};

// Hel kategori sparad som mall (t.ex. en packlista) — bäddar in frusna
// kopior av uppgifterna direkt, oberoende av det separata TodoTemplate-
// biblioteket ovan.
export type TodoCategoryTemplate = {
  id: Id;
  accountId: Id;
  memberId: Id;
  name: string;
  tasks: TodoTemplateTask[];
  createdAt: string;
  deletedAt: string | null;
  deletedBy: Id | null;
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

