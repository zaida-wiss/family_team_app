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
  // Klockslag på todos/rutiner (2026-07-16, Zaidas önskemål efter en resa
  // till Finland). false (standard): tolkas i ENHETENS aktuella tidszon —
  // reser man ändras det visade klockslaget. true: tolkas alltid mot
  // familjens hemtidszon (Europe/Stockholm, se utils/todoTimeZone.ts) — ett
  // satt klockslag förblir detsamma oavsett var enheten fysiskt befinner sig.
  fixedTodoTimes?: boolean;
};

export type AppPanel =
  | "home"
  | "calendar"
  | "shopping"
  | "todos"
  | "recipes"
  | "members"
  | "settings";

export type CalendarViewMode = "month" | "week" | "list" | "timeline";

export type TodoViewMode = "list" | "thread";

// Textstorlek (2026-07-25) — tre diskreta steg för bättre läsbarhet, se
// Member.textSize.
export type TextSize = "normal" | "large" | "extra-large";

// Mina familjekonton (2026-07-25) — se Member.hiddenCrossAccountIds.
export type MyMembership = {
  accountId: Id;
  accountName: string;
  memberId: Id;
};

export type CrossAccountFamilyThread = {
  accountId: Id;
  accountName: string;
  todos: Todo[];
};

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
  | "dusk"
  | "salvia"
  | "karneval";

export type User = {
  id: Id;
  // Ett barn (2026-07-22, se authService.ts:s childLogin) har ingen egen
  // e-post — bara ett username, unikt inom familjen, inte globalt.
  email: string | null;
  username?: string | null;
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
  // Mörkt läge (2026-07-23, Zaidas önskemål: "fortfarande samma tema, men
  // med omvänd färgordning, ljusa färger byter plats med mörka") — en
  // oberoende på/av-växel ovanpå dashboardTheme, inte en egen temaidentitet.
  // Gäller bara vuxenteman (se ThemePicker.tsx). Standard av (osatt/false)
  // om fältet saknas i äldre data.
  darkMode?: boolean;
  // Textstorlek (2026-07-25, Zaidas önskemål: "bättre tillgänglighet för de
  // äldre") — tre diskreta steg, inte en fri slider (mindre att välja fel
  // på). Skalar hela appens rem-baserade typografi via document.documentElement
  // (Shell.tsx), samma självbetjänings-/förälder-styr-barnets-tema-mönster
  // som dashboardTheme/darkMode. Standard "normal" om fältet saknas.
  textSize?: TextSize;
  // Mina familjekonton (2026-07-25, Zaidas önskemål: "du skall se vilka
  // familjer du är med i... kunna avmarkera dessa när de inte används") —
  // en lista av accountId:n vars innehåll (Familjen-todos) INTE ska dyka
  // upp i vyer som visar över alla EGNA medlemskap (skiljer sig från
  // ADR-0024/dela-barn, som är en delnings-GRANT från någon annan — det
  // här är kontons EGNA, riktiga medlemskap). Standard: alla synliga
  // (tomt/osatt) om fältet saknas.
  hiddenCrossAccountIds?: Id[];
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
  // Manuell ordning på BUBBLORNA inom en enskild tråd (2026-07-24, Zaidas
  // önskemål: "jag kanske vill flytta så att 'gå och lägg dig' kommer
  // sist") — nyckel = tråd-id (kategori-id eller sentinel), värde = en lista
  // av STABILA bubbel-nycklar i vald ordning. En stabil nyckel är
  // recurringSourceId för en återkommande uppgift (occurrensen får ett NYTT
  // eget id varje dag, mallens id överlever) annars uppgiftens eget id.
  // Bubblor som saknas i listan hamnar sist, i sin vanliga automatiska
  // sortering (sluttid/starttid) — samma "olistade hamnar sist"-princip som
  // todoThreadOrder.
  todoBubbleOrder?: Record<Id, Id[]>;
  // Hur mycket som visas i tråd-vyn (2026-07-06, Zaidas önskemål) — väljs i
  // Inställningar, samma mönster som todoViewMode. Standard "today" om osatt.
  todoThreadRange?: TodoThreadRange;
  spentStars: number;
  approvedStars: number;
  // Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
  // 2026-07-22, Zaidas önskemål: "separerade föräldrar utan god relation
  // ändå skall kunna dela information om ett gemensamt barn") — bara
  // meningsfullt när isChild är true. memberId+accountId kan peka på en
  // medlem i SAMMA konto (delad roll inom familjen) eller ETT ANNAT konto
  // (mellan familjer) — samma fält, ingen strukturell skillnad. Icke-
  // transitivt BY CONSTRUCTION: att skapa en delning kräver canManageMembers
  // i BARNETS EGET konto (childSharesService.ts), en mottagare som bara har
  // åtkomst via det här fältet uppfyller aldrig det villkoret och kan därför
  // aldrig dela vidare, oavsett egen roll i sitt eget konto.
  childSharedWith?: {
    memberId: Id;
    accountId: Id;
    access: AccessLevel;
    grantedBy: Id;
    grantedAt: string;
  }[];
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
  // Mjuk radering (2026-07-13, "vi ska kunna ta bort tider" i redigera-
  // modalen) — samma deletedAt/deletedBy-mönster som alla andra raderbara
  // entiteter i projektet, aldrig hard delete.
  deletedAt: string | null;
  deletedBy: Id | null;
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
  // Hur ofta appens server pollar den externa länken, i minuter (2026-07-24,
  // Zaidas önskemål). Ingen koppling till användarens egen mobildata/roaming
  // — synken sker på backend-servern, inte på enheten. Standard 60 (samma
  // beteende som innan fältet fanns).
  syncIntervalMinutes: number;
};

// Tvåvägs CalDAV-anslutning (ADR-0027, 2026-07-24) — till skillnad från
// IcsSubscription (läs-bara, ingen autentisering) skriver appen HÄR aktivt
// till en extern kalender också. accountEmail/appSpecificPasswordEnc är
// riktiga tredjepartsuppgifter, krypterade (fieldEncryption) — ALDRIG med
// i GDPR-exporten (se exportAccount), till skillnad från övriga krypterade
// fält som dekrypteras där för dataportabilitet.
export type CalDavConnection = {
  id: Id;
  calendarId: Id;
  provider: "apple";
  accountEmailEnc: string;
  appSpecificPasswordEnc: string;
  externalCalendarHref: string;
  syncIntervalMinutes: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdBy: Id;
  connectedAt: string;
};

export type Calendar = OwnedSharedResource & {
  id: Id;
  name: string;
  color: string;
  keepAllHistory?: boolean;
  events: CalendarEvent[];
  importedSources: ImportedCalendarSource[];
  subscriptions: IcsSubscription[];
  calDavConnections: CalDavConnection[];
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
  // Sätts bara på händelser skrivna ut via en CalDavConnection (ADR-0027,
  // 2026-07-24) — låter oss göra en villkorad PUT (If-Match) vid nästa
  // ändring istället för att blint skriva över en samtidig extern ändring.
  // null tills händelsen pushats minst en gång.
  calDavEtag?: string | null;
  calDavHref?: string | null;
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
  // Delning mellan FAMILJER (2026-07-23, ADR-0026, Zaidas önskemål: "även
  // shoppinglistor skall kunna delas mellan olika familjer") — sharedWith
  // (ovan, ärvt från OwnedSharedResource) är bara INOM samma konto. Samma
  // icke-transitiva mönster som Member.childSharedWith (ADR-0024): en
  // mottagare som bara har åtkomst hit kan strukturellt aldrig dela vidare,
  // se canManageExternalShoppingListShares i shared/permissions.ts. "edit"
  // ger full varu-hantering (lägga till/bocka av/radera), inte omdöpning/
  // radering av själva listan eller delnings-hantering — det stannar hos
  // ägarens EGET konto.
  externalSharedWith?: {
    memberId: Id;
    accountId: Id;
    access: AccessLevel;
    grantedBy: Id;
    grantedAt: string;
  }[];
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
  // "Någon håller på med den här"-indikator (2026-07-22, Zaidas önskemål,
  // Sprint 7:s motivation löst inom EGNA familjen först) — dubbeltryck på
  // bollen i vuxenvyns tråd-vy öppnar en avatarväljare (ParentTodoThreadView.tsx),
  // tryck på en medlems bild lägger till/tar bort DEN medlemmen här. En
  // ensam medlem visas som en tjock kant i medlemmens färg; två eller fler
  // visar istället en delad klocka som räknar från inProgressSince (ingen
  // tävling, bara transparens — se ADR-diskussionen). Rensas automatiskt när
  // uppgiften markeras klar (completeTodo). Valfritt och bakåtkompatibelt —
  // hanteras bara via PATCH .../in-progress, inte generisk TodoPatchSchema.
  inProgressBy?: Id[];
  inProgressSince?: string | null;
};

export type TodoTimeWindow = {
  visibleFrom: string | null;
  expiresAt: string | null;
};

export type TodoSubtask = {
  id: Id;
  title: string;
  done: boolean;
  // Delmoment kan tilldelas en enskild familjemedlem (2026-07-23, Zaidas
  // önskemål: "deluppgifter skall gå att assigna av familjemedlemmar...
  // så de blir färger som tillhör familjemedlemmen") — helt oberoende av
  // vem/vad HELA uppgiften (Todo.assignedTo) är tilldelad, t.ex. en delad
  // Familjen-uppgift "Handla mat" där olika delmoment görs av olika
  // personer. Valfritt och bakåtkompatibelt, saknas fältet visas
  // delmomentet som otilldelat.
  assignedTo?: Id | null;
  // Recept-integration (2026-07-25, ADR-0028) — kopieras rakt av från
  // RecipeStep.timedMinutes när en uppgift skapas från ett recept. Satt =
  // steget är tidsstyrt (t.ex. "sätt in i ugnen, 25 min"). Egen, medveten
  // SKILD mekanism från Todo.plannedDurationMinutes (ADR-0018, en timer för
  // HELA uppgiften) — den här gäller ETT delmoment.
  timedMinutes?: number | null;
  // Sätts AUTOMATISKT av backend (toggleSubtask) när ett delmoment med
  // timedMinutes går från obockat→bockat, nollställs vid av-bockning.
  // Klienten räknar ner från timerStartedAt+timedMinutes (samma
  // "klienten mäter"-princip som ADR-0018).
  timerStartedAt?: string | null;
};

// Recept (2026-07-25, ADR-0028) — kontobred som TodoCategory sedan
// ADR-0019, mutationer kräver en vuxen. Ingredienser är fri text (samma
// filosofi som CSV-importens rader), ingen strukturerad mängd/enhet.
export type RecipeIngredient = {
  id: Id;
  text: string;
};

export type RecipeStep = {
  id: Id;
  text: string;
  timedMinutes: number | null;
};

export type Recipe = {
  id: Id;
  accountId: Id;
  name: string;
  emoji: string | null;
  // Riktig bild (2026-07-26, Zaidas önskemål) — samma Cloudinary-uppladdning
  // som medlemmars profilbilder (uploadImage.ts, folder "recipes"), helt
  // separat från emoji (som fortsatt visas i listor/rubriker, oberoende av
  // om ett foto satts).
  imageUrl: string | null;
  // Länk till receptet (2026-07-26, Zaidas önskemål) — t.ex. källan man
  // hittade receptet på. Fri text, ingen URL-validering server-side (samma
  // "lita på fritext"-hållning som övriga fria fält på Recipe).
  sourceUrl: string | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  // Söktaggar + skapad-tidsstämpel (2026-07-25, Zaidas önskemål: "kunna
  // filtrera och sortera i recepten och lägga till söktaggar").
  tags: string[];
  createdAt: string;
  createdBy: Id;
  deletedAt: string | null;
  deletedBy: Id | null;
};

// Hushållets lösenord + abonnemang (2026-07-25, Zaidas önskemål — två
// separata "kategorier i Inställningar", samma underliggande modell med en
// kind-diskriminator eftersom de delar samma behov: kontobrett, ENDAST
// vuxna (till skillnad från Recept — dessa är ofta genuint känsliga:
// wifi-lösenord, försäkringsinloggningar, bankinfo), fältkrypterade.
// **Krypteringsmodell (Zaidas beslut):** samma server-hållna master-nyckel
// som redan skyddar kalender/todos/belöningar (fieldEncryption.ts) — INTE
// en riktig klientsidig/nolltillit-lösning. Det betyder: appens server
// (och därmed Render/MongoDB-åtkomst) kan tekniskt dekryptera dessa fält —
// kryptering VID LAGRING, inte en oberoende "bara ni har nyckeln"-garanti.
// Dokumenterat tydligt för Zaida innan byggnation. secretEnc/username/notes
// krypterade; ALDRIG med i GDPR-exporten (samma princip som ADR-0027:s
// CalDAV-lösenord — riktiga tredjepartsuppgifter i en nedladdningsbar fil
// vore ett läckage, till skillnad från vanligt appinnehåll som redan
// dekrypteras där för dataportabilitet).
export type HouseholdSecretKind = "password" | "subscription";

export type HouseholdSecret = {
  id: Id;
  accountId: Id;
  kind: HouseholdSecretKind;
  title: string;
  username: string | null;
  secretEnc: string;
  notes: string | null;
  cost: number | null;
  renewalDate: string | null;
  createdBy: Id;
  deletedAt: string | null;
  deletedBy: Id | null;
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

