import { lazy, Suspense, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import type { CalendarFilter } from "../calendars/CalendarView";
import type { AddEventInput } from "../calendars/useCalendarsState";
import type { CalendarPanel } from "../calendars/CalendarPanel";

const ChildDashboard = lazy(() =>
  import("../children/ChildDashboard").then((m) => ({ default: m.ChildDashboard }))
);
const ChildRecordsPage = lazy(() =>
  import("../children/ChildRecordsPage").then((m) => ({ default: m.ChildRecordsPage }))
);
const PersonalDashboard = lazy(() =>
  import("./PersonalDashboard").then((m) => ({ default: m.PersonalDashboard }))
);
const CalendarPage = lazy(() =>
  import("../../pages/CalendarPage").then((m) => ({ default: m.CalendarPage }))
);
const ShoppingView = lazy(() =>
  import("../shopping/ShoppingView").then((m) => ({ default: m.ShoppingView }))
);
const TodosView = lazy(() =>
  import("../todos/TodosView").then((m) => ({ default: m.TodosView }))
);
const RecipesView = lazy(() =>
  import("../recipes/RecipesView").then((m) => ({ default: m.RecipesView }))
);
import { HomePage } from "../../pages/HomePage";
import { canViewResource, canSeeMembersPanel, hasPermission } from "../../utils/permissions";
import { getFamilyViewTodos } from "../todos/selectors";
import { useCrossAccountFamilyTodos, useCrossAccountMembers, useCrossAccountRecipes, useCrossAccountShoppingLists } from "../todos/useCrossAccountFamilyState";
import { useConnectionTodos, useConnectionMembers, useConnectionShoppingLists } from "../accounts/useFamilyConnectionsState";
import { generateId } from "../../utils/uuid";
import type { ShellPanel } from "../../hooks/useAppState";
import type { Calendar, CalendarEvent, CalendarFilterKey, CalendarSettings, CalendarViewMode, Id, Member, Recipe, Reward, Role, ShoppingList, Todo, TodoCategory, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask, TodoThreadRange, TodoViewMode, TimedTaskWithBest } from "@shared/types";
import type { TimedAttemptListItem } from "../../api/timedTasks";
import type { RecipeFormInput } from "../recipes/RecipeFormModal";

type CalendarPanelProps = ComponentProps<typeof CalendarPanel>;

type Props = {
  activePanel: ShellPanel;
  accountName: string;
  currentMember: Member;
  activeMembers: Member[];
  members: Member[];
  selectedDashboardMemberId: string | null;
  roles: Role[];
  todos: Todo[];
  rewards: Reward[];
  calendars: Calendar[];
  shoppingLists: ShoppingList[];
  recipes: Recipe[];
  onCreateRecipe: (input: RecipeFormInput) => Promise<Recipe>;
  onUpdateRecipe: (id: Id, input: RecipeFormInput) => Promise<void>;
  onRemoveRecipe: (id: Id) => Promise<void>;
  defaultRecipeShoppingListId: Id | null;
  fixedTodoTimes: boolean;
  fixedCalendarTimes: boolean;
  timedTasks: TimedTaskWithBest[];
  onRecordTimedAttempt: (id: Id, durationMs: number, achievedAt: string) => Promise<{ isNewRecord: boolean }>;
  onListTimedAttempts: (id: Id) => Promise<TimedAttemptListItem[]>;
  onDeleteTimedAttempt: (id: Id, attemptId: Id) => Promise<void>;
  canSeeCalendar: boolean;
  canSeeTodos: boolean;
  canSeeShopping: boolean;
  canApproveTodos: boolean;
  canManageMembers: boolean;
  wishStars: Record<string, number>;
  todoViewMode: TodoViewMode;
  todoThreadOrder: Id[];
  onReorderThreads: (order: Id[]) => void;
  todoBubbleOrder: Record<Id, Id[]>;
  onReorderBubbles: (threadId: Id, order: Id[]) => void;
  todoThreadRange: TodoThreadRange;
  todoThreadGap?: number;
  todoBubbleSize?: number;
  // Hem-vyns familjefilter (2026-07-31) — senast valda familj, sparad
  // server-side (samma updateMemberNavigation-mönster som ovan).
  homeSelectedFamilyId?: Id | null;
  onUpdateHomeSelectedFamilyId: (id: Id | null) => void;
  onNavigate: (panel: ShellPanel) => void;
  onSelectMember: (id: string) => void;
  onCreateTodo: (todo: Todo) => void;
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onToggleTodoInProgress: (todoId: Id, targetMemberId: Id) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: Id) => void;
  personalCategories: TodoCategory[];
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onRenameCategory: (id: Id, name: string) => void;
  onRemoveCategory: (id: Id) => void;
  onSetCategoryHidden: (id: Id, hidden: boolean) => void;
  taskTemplates: TodoTemplate[];
  categoryTemplates: TodoCategoryTemplate[];
  onCreateTaskTemplate: (task: TodoTemplateTask) => Promise<TodoTemplate>;
  onCreateCategoryTemplate: (
    name: string,
    tasks: TodoTemplateTask[],
    sourceCategoryId?: Id | null
  ) => Promise<TodoCategoryTemplate>;
  onUpdateCategoryTemplate: (id: Id, name: string, tasks: TodoTemplateTask[]) => Promise<TodoCategoryTemplate>;
  onSoftDeleteTodo: (todoId: string) => void;
  onApproveWish: (rewardId: string) => void;
  onRejectWish: (rewardId: string) => void;
  onSetWishStars: (rewardId: string, stars: number) => void;
  onAddCalendarEvent: (calendarId: Id, event: AddEventInput) => void;
  onUpdateCalendarEvent: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteCalendarEvent: (calendarId: string, eventId: string) => void;
  onRsvpCalendarEvent: (calendarId: string, eventId: string, status: "accepted" | "declined") => void;
  onCreateCalendar: (name: string, color: string) => void;
  onUpdateCalendarFilterSettings: (filterKey: CalendarFilterKey, visibleCalendarIds: string[]) => void;
  onUpdateCalendarView: (view: CalendarViewMode) => void;
  onImportCalendar: CalendarPanelProps["onImportCalendar"];
  onShareCalendar: (calendarId: Id, memberId: Id, access: "view" | "edit") => void;
  onRemoveCalendarShare: (calendarId: string, memberId: string) => void;
  onAddShoppingItem: (listId: string, title: string) => void;
  // Returnerar det nya listans id (2026-07-25, ADR-0028) — recepts
  // "handlingslista"-flöde behöver kunna lägga till varor direkt efter.
  onCreateShoppingList: (name: string, icon?: string | null) => Id;
  onDeleteShoppingList: (listId: string) => void;
  onRenameShoppingList: (listId: Id, name: string) => void;
  onShareShoppingList: (listId: Id, memberId: Id, access: "view" | "edit") => void;
  onRemoveShoppingListShare: (listId: string, memberId: string) => void;
  onToggleShoppingItem: (listId: string, itemId: string) => void;
  onDeleteShoppingItem: (listId: string, itemId: string) => void;
  onReorderShoppingItems: (listId: string, itemIds: string[]) => void;
  onClearCompletedShoppingItems: (listId: string) => void;
  shoppingShowCompletedDefault?: boolean;
  calendarSettings?: CalendarSettings;
  onThemePickerOpen: (memberId: string) => void;
  onCompleteTodo: (member: Member, todoId: string, roles: Role[], elapsedMs?: number | null) => void;
  onDismissRejectedTodo: (todoId: string, memberId: string) => void;
  onCreateWish: (childId: string, starsNeeded?: number, title?: string) => void;
  onLoadEventsForMonth?: (year: number, month: number) => Promise<void>;
  onUpdateCalendarKeepAllHistory?: CalendarPanelProps["onUpdateCalendarKeepAllHistory"];
};

function isTodoVisibleNow(
  todo: { visibleFrom: string | null; expiresAt: string | null },
  now: number
) {
  const from = todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.NEGATIVE_INFINITY;
  const until = todo.expiresAt ? new Date(todo.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  return from <= now && now < until;
}

export function MemberShellContent({
  activePanel, accountName,

  currentMember, activeMembers, members, selectedDashboardMemberId, roles,
  todos, rewards, calendars, shoppingLists, recipes, onCreateRecipe, onUpdateRecipe, onRemoveRecipe,
  defaultRecipeShoppingListId, fixedTodoTimes, fixedCalendarTimes, timedTasks, onRecordTimedAttempt,
  onListTimedAttempts, onDeleteTimedAttempt,
  canSeeCalendar, canSeeTodos, canSeeShopping, canApproveTodos, canManageMembers,
  wishStars, todoViewMode,
  todoThreadOrder, onReorderThreads, todoBubbleOrder, onReorderBubbles, todoThreadRange, todoThreadGap, todoBubbleSize,
  homeSelectedFamilyId, onUpdateHomeSelectedFamilyId,
  onNavigate, onSelectMember, onCreateTodo, onToggleSubtask, onToggleTodoInProgress, onUpdateTodo, onRefreshRoutine, onSoftDeleteTodo,
  personalCategories, onCreateCategory, onRenameCategory, onRemoveCategory, onSetCategoryHidden,
  taskTemplates, categoryTemplates, onCreateTaskTemplate, onCreateCategoryTemplate, onUpdateCategoryTemplate,
  onApproveWish, onRejectWish, onSetWishStars, onAddCalendarEvent,
  onUpdateCalendarEvent, onDeleteCalendarEvent, onRsvpCalendarEvent,
  onUpdateCalendarFilterSettings, onUpdateCalendarView,
  onAddShoppingItem, onToggleShoppingItem, onDeleteShoppingItem, onReorderShoppingItems, onClearCompletedShoppingItems,
  shoppingShowCompletedDefault,
  onCreateShoppingList, onDeleteShoppingList, onRenameShoppingList, onShareShoppingList, onRemoveShoppingListShare,
  onThemePickerOpen, onCompleteTodo,
  onDismissRejectedTodo, onCreateWish, calendarSettings, onLoadEventsForMonth,
}: Props) {
  const [calSearch, setCalSearch] = useState("");
  const [homeSearch, setHomeSearch] = useState("");
  // Egen sida för Medaljer/Rekord (2026-07-06) — samma pokal-knapp/sida som
  // barnets egen vy, men här när en vuxen tittar på ett barns dashboard.
  const [showChildRecords, setShowChildRecords] = useState(false);

  const canSeeAllCalendars = hasPermission(currentMember, roles, "canSeeAllCalendar");
  const canSeeOwnCalendars = hasPermission(currentMember, roles, "canSeeOwnCalendar");

  // Hemvyns familjeöversikt (2026-07-30, omdefinierad 2026-07-31 — Zaidas
  // önskemål: "Todos som tillhör familjen eller alla (vuxna) skall visas i
  // familjevyn. Mina privata todos... skall inte visas i familjevyns todo.")
  // — getFamilyViewTodos (inte längre getVisibleTodos, som en canSeeAllTodos-
  // medlem såg ALLT igenom, inklusive andras privata personliga kategorier).
  const homeVisibleTodos = useMemo(
    () => (canSeeTodos ? getFamilyViewTodos(todos, roles, members) : []),
    [canSeeTodos, todos, roles, members]
  );
  const canSeeMembers = canSeeMembersPanel(currentMember, roles);

  // Hem-vyns familjefilter (2026-07-31, Zaidas önskemål: "om jag väljer en
  // familj, då vill jag att endast den familjens kalenderhändelser, todos
  // och medlemmar visas, men möjlighet att välja samtliga familjer") — de
  // två redan befintliga grupperade "andra familjer"-todos-hookarna
  // (Todos-panelens egna trådar, oförändrade där) återanvänds här BARA för
  // att bygga Hem-sammanfattningens utökade dataset. Panelerna är aldrig
  // monterade samtidigt (activePanel växlar, ErrorBoundary key={activePanel}
  // remountar), så två separata hook-instanser (en här, en i
  // CrossAccountFamilyThreads.tsx/ConnectionTodosThreads.tsx) kostar ingen
  // dubbel nätverkstrafik i praktiken.
  const {
    threads: crossAccountFamilyThreads,
    completeCrossAccountTodo,
    createCrossAccountTodo,
    toggleCrossAccountInProgress
  } = useCrossAccountFamilyTodos();
  const { threads: connectionTodoThreads, createConnectionTodo, completeConnectionTodo } = useConnectionTodos();
  const crossAccountMemberGroups = useCrossAccountMembers();
  const connectionMemberGroups = useConnectionMembers();
  // Inköp-fliken (2026-07-31) — bara Familjeanslutningar bidrar med delade
  // listor här (samma redan befintliga hook som Inköp-panelens egen
  // ConnectionShoppingLists-sektion använder). "Mina familjekonton" har
  // medvetet INGEN egen cross-account-inköpslista-endpoint än (till
  // skillnad från todos/kalender/medlemmar) — väljer man ett SÅDANT konto
  // i familjefiltret är Inköp-fliken tom där, se CLAUDE.md.
  const connectionShoppingGroups = useConnectionShoppingLists();
  // Mina familjekonton (2026-08-01, Zaidas önskemål: "samma gäller
  // inköpslistan" — sedan rättad till ENDAST genuint medlemskap, aldrig en
  // Familjeanslutning, se createCrossAccountList-kommentaren).
  const { groups: crossAccountShoppingGroups, createCrossAccountList } = useCrossAccountShoppingLists();
  // Måltidsplanering (2026-08-01, Zaidas önskemål: "man ska inte heller
  // kunna planera måltider med andra familjer, utan då måste man först göra
  // en familj med dessa familjer som medlemmar") — ENDAST Mina familjekonton.
  const crossAccountRecipeGroups = useCrossAccountRecipes();

  const homeFamilyOptions = useMemo(() => {
    const map = new Map<Id, string>();
    map.set(currentMember.accountId, accountName);
    for (const t of crossAccountFamilyThreads) map.set(t.accountId, t.accountName);
    for (const t of connectionTodoThreads) map.set(t.accountId, t.accountName);
    for (const g of crossAccountMemberGroups) map.set(g.accountId, g.accountName);
    for (const g of connectionMemberGroups) map.set(g.accountId, g.accountName);
    for (const g of connectionShoppingGroups) map.set(g.accountId, g.accountName);
    for (const g of crossAccountShoppingGroups) map.set(g.accountId, g.accountName);
    for (const g of crossAccountRecipeGroups) map.set(g.accountId, g.accountName);
    for (const cal of calendars) {
      if (cal.readOnly && cal.accountId && cal.sourceAccountName) map.set(cal.accountId, cal.sourceAccountName);
    }
    return [...map.entries()].map(([accountId, name]) => ({ accountId, accountName: name }));
  }, [currentMember.accountId, accountName, crossAccountFamilyThreads, connectionTodoThreads, crossAccountMemberGroups, connectionMemberGroups, connectionShoppingGroups, crossAccountShoppingGroups, crossAccountRecipeGroups, calendars]);


  const homeExtraMembers = useMemo(
    () =>
      canSeeMembers
        ? [
            ...crossAccountMemberGroups.flatMap((g) => g.members.map((m) => ({ ...m, accountId: g.accountId }))),
            ...connectionMemberGroups.flatMap((g) => g.members.map((m) => ({ ...m, accountId: g.accountId })))
          ]
        : [],
    [canSeeMembers, crossAccountMemberGroups, connectionMemberGroups]
  );

  // Hem-vyns familjetrådar (2026-08-01, Zaidas önskemål: "hemvyn skall vara
  // återanvändbara moduler med samma logik som i navbarens vyer... man skall
  // signa upp sig på en uppgift på samma sätt som i todovyn med bollar i
  // trådar") — en FamilyThreadSource per familj, redan hopkopplad med rätt
  // mutationer (så FamilyTodoThreads.tsx aldrig behöver veta vilket konto en
  // tråd hör till). Egen resolveringslogik för mitt eget kontos onComplete,
  // samma som TodosView.tsx:s onCompleteTodo-closure ovan (assignee = jag
  // själv om otilldelad, annars den faktiskt tilldelade vuxna).
  function completeOwnFamilyTodo(todoId: Id) {
    const todo = todos.find((t) => t.id === todoId);
    const assignee = todo?.assignedTo === null ? currentMember : members.find((m) => m.id === todo?.assignedTo);
    if (assignee) onCompleteTodo(assignee, todoId, roles);
  }

  const homeFamilyThreadSources = useMemo(() => {
    if (!canSeeTodos) return [];
    const own = {
      id: "__familyHome__",
      accountId: currentMember.accountId,
      label: "Familjen",
      todos: homeVisibleTodos,
      members: activeMembers,
      onComplete: completeOwnFamilyTodo,
      onToggleInProgress: onToggleTodoInProgress,
      onToggleSubtask,
      onCreateTodo: (title: string, visual: string | null) => handleCreateFamilyTodo(currentMember.accountId, title, visual)
    };
    const cross = crossAccountFamilyThreads.map((t) => ({
      id: `crossAccount:${t.accountId}`,
      accountId: t.accountId,
      label: t.accountName,
      todos: t.todos,
      members: crossAccountMemberGroups.find((g) => g.accountId === t.accountId)?.members ?? [],
      onComplete: (todoId: Id) => completeCrossAccountTodo(t.accountId, todoId),
      onToggleInProgress: (todoId: Id, targetMemberId: Id) => toggleCrossAccountInProgress(t.accountId, todoId, targetMemberId),
      onCreateTodo: (title: string, visual: string | null) => createCrossAccountTodo(t.accountId, title, visual)
    }));
    // Familjeanslutningar (2026-08-01) — ingen egen identitet i målkontot,
    // så ingen "vem håller på med den här"-väljare (onToggleInProgress
    // utelämnad, members tom) — bara läsning + håll-in-för-att-klarmarkera
    // (redan möjligt sedan tidigare, completeConnectionTodo). Skapande bara
    // om anslutningen har redigera-åtkomst.
    const connections = connectionTodoThreads.map((t) => ({
      id: `connection:${t.accountId}`,
      accountId: t.accountId,
      label: t.accountName,
      todos: t.todos,
      members: [],
      onComplete: (todoId: Id) => completeConnectionTodo(t.accountId, todoId),
      onCreateTodo:
        t.access === "edit"
          ? (title: string, visual: string | null) => createConnectionTodo(t.accountId, title, visual)
          : undefined
    }));
    return [own, ...cross, ...connections];
  }, [
    canSeeTodos, currentMember.accountId, currentMember.id, homeVisibleTodos, activeMembers, todos, members, roles,
    onCompleteTodo, onToggleTodoInProgress, onToggleSubtask, crossAccountFamilyThreads, crossAccountMemberGroups,
    completeCrossAccountTodo, toggleCrossAccountInProgress, createCrossAccountTodo, connectionTodoThreads,
    completeConnectionTodo, createConnectionTodo
  ]);

  // Mina uppgifter-tråden (Todos-panelen) inkluderar todos jag SIGNAT UPP på
  // från Mina familjekonton (2026-08-01, Zaidas rättelse: "signa upp sig...
  // samma gester som todovyn" — dubbeltryck/"vem håller på med den här",
  // inte en separat Ta uppgiften-knapp) — myMemberId (min egen medlemspost i
  // det andra kontot, se CrossAccountFamilyThread) avgör vilka todos som är
  // MIG i inProgressBy, utan att gissa. Familjeanslutningar har ingen egen
  // identitet att signa upp med — bara Mina familjekonton kan bidra hit.
  const crossAccountClaimedTasks = useMemo(
    () =>
      crossAccountFamilyThreads
        .map((t) => ({ ...t, todos: t.todos.filter((td) => td.inProgressBy?.includes(t.myMemberId)) }))
        .filter((t) => t.todos.length > 0),
    [crossAccountFamilyThreads]
  );

  const homeAllShoppingLists = useMemo(
    () =>
      canSeeShopping
        ? [
            ...shoppingLists,
            ...connectionShoppingGroups.flatMap((g) => g.lists),
            ...crossAccountShoppingGroups.flatMap((g) => g.lists)
          ]
        : [],
    [canSeeShopping, shoppingLists, connectionShoppingGroups, crossAccountShoppingGroups]
  );

  // Ny lista går bara att skapa i familjer jag är en RIKTIG medlem av
  // (2026-08-01, Zaidas rättelse: "man ska inte kunna göra inköpslistor i
  // familjer man inte är medlem i") — mitt eget konto + Mina familjekonton,
  // ALDRIG en Familjeanslutning (bara läsning där).
  const homeShoppingCreatableAccountIds = useMemo(
    () => new Set([currentMember.accountId, ...crossAccountShoppingGroups.map((g) => g.accountId)]),
    [currentMember.accountId, crossAccountShoppingGroups]
  );

  const accessibleCalendarIds = useMemo(
    () =>
      calendars
        .filter((calendar) => {
          if (calendar.deletedAt !== null) return false;
          if (canSeeAllCalendars) return true;
          return canSeeOwnCalendars && canViewResource(currentMember, calendar);
        })
        .map((calendar) => calendar.id),
    [calendars, canSeeAllCalendars, canSeeOwnCalendars, currentMember]
  );

  const calendarFilter = useMemo<CalendarFilter>(() => {
    const savedVisibleCalendarIds = currentMember.calendarFilterSettings?.calendar?.visibleCalendarIds;
    const hiddenCalendarIds = savedVisibleCalendarIds
      ? new Set(accessibleCalendarIds.filter((id) => !savedVisibleCalendarIds.includes(id)))
      : new Set<string>();

    return {
      searchQuery: calSearch,
      setSearchQuery: setCalSearch,
      hiddenCalendarIds,
      setHiddenCalendarIds: (nextHiddenCalendarIds) => {
        const visibleCalendarIds = accessibleCalendarIds.filter((id) => !nextHiddenCalendarIds.has(id));
        onUpdateCalendarFilterSettings("calendar", visibleCalendarIds);
      }
    };
  }, [accessibleCalendarIds, calSearch, currentMember.calendarFilterSettings, onUpdateCalendarFilterSettings]);

  const homeFilter = useMemo<CalendarFilter>(() => {
    const savedVisibleCalendarIds = currentMember.calendarFilterSettings?.home?.visibleCalendarIds;
    const hiddenCalendarIds = savedVisibleCalendarIds
      ? new Set(accessibleCalendarIds.filter((id) => !savedVisibleCalendarIds.includes(id)))
      : new Set<string>();

    return {
      searchQuery: homeSearch,
      setSearchQuery: setHomeSearch,
      hiddenCalendarIds,
      setHiddenCalendarIds: (nextHiddenCalendarIds) => {
        const visibleCalendarIds = accessibleCalendarIds.filter((id) => !nextHiddenCalendarIds.has(id));
        onUpdateCalendarFilterSettings("home", visibleCalendarIds);
      }
    };
  }, [accessibleCalendarIds, currentMember.calendarFilterSettings, homeSearch, onUpdateCalendarFilterSettings]);

  const selectedDashboardMember = useMemo(
    () => activeMembers.find((m) => m.id === selectedDashboardMemberId) ?? null,
    [activeMembers, selectedDashboardMemberId]
  );

  const selectedMemberRole = useMemo(
    () => selectedDashboardMember ? roles.find((r) => r.id === selectedDashboardMember.roleId) ?? null : null,
    [roles, selectedDashboardMember]
  );

  const children = useMemo(
    () => activeMembers.filter((m) => m.isChild),
    [activeMembers]
  );

  // ── Valt barn → barnens dashboard, oavsett vald panel (2026-07-22, Zaidas
  // önskemål: "Även vuxna skall kunna se samma barnvy som om de vore ett
  // barn") ────────────────────────────────────────────────────────────────
  // Ett inloggat barn har bara EN vy överhuvudtaget (ChildShellContent.tsx
  // routar aldrig via HeroBar/activePanel — inget separat Todos/Kalender/
  // Inköp-nav finns för barn). Den här kontrollen låg tidigare bara i
  // Hem-panelens fallback-logik längst ner, så en vuxen som valt ett barn
  // och sedan klickade Kalender/Todos/Inköp i sin EGEN navigering föll
  // tillbaka på den vuxna panelvyn istället för barnets faktiska dashboard.
  // Flyttad hit, FÖRE de panelspecifika grenarna, så valt barn alltid vinner
  // oavsett vilken av adult-navens knappar som råkar vara aktiv — precis
  // samma ChildDashboard/ChildRecordsPage som barnet self ser inloggat.
  const selectedMemberIsChild =
    !!selectedDashboardMember && (selectedDashboardMember.isChild || !!selectedMemberRole?.isChildRole);

  // Alla medlemmar (2026-07-27, Zaidas fynd: "får alla vuxna även en
  // barnvy? Nu står Lars som förälder och han får ingen barnvy") — ett
  // medlemsval visar nu PersonalDashboard/ChildDashboard för VILKEN medlem
  // som helst, inte bara vid SJÄLV-val (2026-07-22-beslutet, som uttryckligen
  // undantog "en vuxen som väljer en ANNAN vuxen", reverserat här på Zaidas
  // begäran). Datan var redan tillgänglig för den inloggade (samma
  // todos/calendars-props som redan speglas i tråd-vyn/kalenderpanelen,
  // scopade av den vanliga behörighetsmodellen innan de ens når hit) — det
  // här ändrar bara PRESENTATIONEN, inte vad som blir synligt.
  //
  // 2026-07-23: ett medlemsval ska bara ha effekt på Medlemmar-panelen —
  // Hem/Kalender/Todos/Inköp visar alltid den inloggades EGEN vy.
  // useAppState.ts:s setActivePanel rensar redan selectedDashboardMemberId
  // vid varje nav-klick, så detta borde strukturellt aldrig triggas utanför
  // activePanel==="members" — men kontrollen läggs ändå till explicit här,
  // eftersom en medlem sparad FÖRE den ändringen kan ha ett gammalt
  // lastActivePanel:"home" ihop med ett kvarvarande
  // lastSelectedDashboardMemberId (då satte MembersView.tsx:s val alltid om
  // lastActivePanel till "home") — utan denna extra spärr hade en sådan
  // medlem sett en annans dashboard på Hem igen efter en enda
  // sidomladdning, med fel nav-ikon markerad.
  if (selectedDashboardMember && activePanel === "members") {
    const now = Date.now();
    // Ogömda/tilldelade uppgifter bara (2026-07-22, Zaidas önskemål: "mallar
    // till listor och undanlagda listor skall inte stå med i barnvyn ens för
    // vuxna, endast assignade 2do") — assignedTo===id och recurrence==="none"
    // uteslöt redan MALLAR/ej tilldelade uppgifter (en mall har recurrence
    // !=="none", en otilldelad uppgift matchar aldrig ett riktigt medlems-id).
    // Det som SAKNADES: en uppgift i en GÖMD kategori ("Göm" i kategorimenyn,
    // se ParentTodoThreadView.tsx) visades ändå på dashboarden — en gömd
    // kategori ska vara "undanlagd" överallt, inte bara i tråd-vyn.
    // 2026-07-24, Zaidas önskemål: skriver ett barn upp sig ("håller på
    // med", inProgressBy) på en otilldelad Familjen-uppgift ska den även
    // dyka upp i barnets EGEN dashboard-lista, inte bara i vuxenvyns
    // gemensamma Familjen-tråd.
    const activeChildTodos = todos
      .filter(
        (t) =>
          (t.assignedTo === selectedDashboardMember.id ||
            (t.assignedTo === null && t.inProgressBy?.includes(selectedDashboardMember.id))) &&
          t.status === "pending" &&
          t.recurrence.type === "none" &&
          t.deletedAt === null &&
          isTodoVisibleNow(t, now) &&
          !(t.personalCategoryId && personalCategories.find((c) => c.id === t.personalCategoryId)?.hidden)
      )
      .sort((a, b) => {
        const aTime = a.visibleFrom ? new Date(a.visibleFrom).getTime() : 0;
        const bTime = b.visibleFrom ? new Date(b.visibleFrom).getTime() : 0;
        return aTime - bTime;
      });
    const rejectedTodos = todos.filter(
      (t) =>
        t.assignedTo === selectedDashboardMember.id &&
        t.status === "rejected" &&
        t.deletedAt === null
    );

    if (selectedMemberIsChild && showChildRecords) {
      return (
        <Suspense fallback={null}>
          <ChildRecordsPage
            themeName={selectedDashboardMember.dashboardTheme ?? "space"}
            timedTasks={timedTasks.filter((t) => t.assignedTo === selectedDashboardMember.id)}
            onRecordAttempt={onRecordTimedAttempt}
            onListAttempts={onListTimedAttempts}
            onDeleteAttempt={onDeleteTimedAttempt}
            onBack={() => setShowChildRecords(false)}
          />
        </Suspense>
      );
    }

    if (selectedMemberIsChild) {
      return (
        <Suspense fallback={null}>
          <ChildDashboard
            child={selectedDashboardMember}
            calendars={calendars}
            roles={roles}
            categories={personalCategories}
            timelineTodos={todos}
            activeChildTodos={activeChildTodos}
            rejectedTodos={rejectedTodos}
            onOpenRecords={() => setShowChildRecords(true)}
            onCreateWish={onCreateWish}
            onCompleteTodo={(todoId, elapsedMs) => onCompleteTodo(selectedDashboardMember, todoId, roles, elapsedMs)}
            onDismissRejectedTodo={(todoId) =>
              onDismissRejectedTodo(todoId, selectedDashboardMember.id)
            }
            onThemePickerOpen={onThemePickerOpen}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={null}>
        <PersonalDashboard
          member={selectedDashboardMember}
          calendars={calendars}
          roles={roles}
          categories={personalCategories}
          timelineTodos={todos}
          activeTodos={activeChildTodos}
          rejectedTodos={rejectedTodos}
          onCompleteTodo={(todoId, elapsedMs) => onCompleteTodo(selectedDashboardMember, todoId, roles, elapsedMs)}
          onDismissRejectedTodo={(todoId) =>
            onDismissRejectedTodo(todoId, selectedDashboardMember.id)
          }
        />
      </Suspense>
    );
  }

  // ── Kalender-vy (nav) ────────────────────────────────────────────────────
  // Visar alltid den inloggades EGEN kalender (2026-07-23, Zaidas beslut
  // reverserar 2026-07-21/22-beteendet där en vald medlem styrde förvalet
  // här via focusMemberId — se useCalendarView.ts, propen finns kvar där men
  // får aldrig längre ett värde från detta anropsställe).
  if (activePanel === "calendar") {
    return (
      <Suspense fallback={null}>
        <CalendarPage
          calendars={canSeeCalendar ? calendars : []}
          currentMember={currentMember}
          activeMembers={activeMembers}
          roles={roles}
          calendarSettings={calendarSettings}
          calendarView={currentMember.calendarView ?? "month"}
          filter={calendarFilter}
          onCalendarViewChange={onUpdateCalendarView}
          onAddEvent={onAddCalendarEvent}
          onUpdateEvent={onUpdateCalendarEvent}
          onDeleteEvent={onDeleteCalendarEvent}
          onRsvpEvent={onRsvpCalendarEvent}
          onMonthChange={onLoadEventsForMonth}
          fixedCalendarTimes={fixedCalendarTimes}
        />
      </Suspense>
    );
  }

  // ── Inköps-vy (nav) — bocka av, lägg till varor, skapa/dela listor ───────
  if (activePanel === "shopping") {
    return (
      <Suspense fallback={null}>
        <ShoppingView
          currentMember={currentMember}
          members={activeMembers}
          roles={roles}
          shoppingLists={canSeeShopping ? shoppingLists : []}
          showCompletedDefault={shoppingShowCompletedDefault}
          onAddItem={onAddShoppingItem}
          onToggleItem={onToggleShoppingItem}
          onDeleteItem={onDeleteShoppingItem}
          onReorderItems={onReorderShoppingItems}
          onClearCompleted={onClearCompletedShoppingItems}
          onCreateList={onCreateShoppingList}
          onDeleteList={onDeleteShoppingList}
          onRenameList={onRenameShoppingList}
          onShareList={onShareShoppingList}
          onRemoveListShare={onRemoveShoppingListShare}
        />
      </Suspense>
    );
  }

  // ── Todos-vy (nav) — skapa/klara/godkänn, ingen delnings-UI ─────────────
  if (activePanel === "todos") {
    return (
      <Suspense fallback={null}>
        <TodosView
          currentMember={currentMember}
          members={activeMembers}
          allMembers={members}
          roles={roles}
          todos={todos}
          rewards={rewards}
          canApproveTodos={canApproveTodos}
          canSeeTodos={canSeeTodos}
          fixedTodoTimes={fixedTodoTimes}
          wishStars={wishStars}
          todoViewMode={todoViewMode}
          todoThreadOrder={todoThreadOrder}
          onReorderThreads={onReorderThreads}
          todoBubbleOrder={todoBubbleOrder}
          onReorderBubbles={onReorderBubbles}
          todoThreadRange={todoThreadRange}
          todoThreadGap={todoThreadGap}
          todoBubbleSize={todoBubbleSize}
          showChildTodosInOwnView={currentMember.showChildTodosInOwnView ?? false}
          extraMyTasks={crossAccountClaimedTasks}
          onCompleteExtraMyTask={completeCrossAccountTodo}
          onReleaseExtraMyTask={(accountId, todoId) => {
            const myMemberId = crossAccountFamilyThreads.find((t) => t.accountId === accountId)?.myMemberId;
            if (myMemberId) toggleCrossAccountInProgress(accountId, todoId, myMemberId);
          }}
          onCreateTodo={onCreateTodo}
          onToggleSubtask={onToggleSubtask}
          onToggleTodoInProgress={onToggleTodoInProgress}
          onUpdateTodo={onUpdateTodo}
          onRefreshRoutine={onRefreshRoutine}
          onCompleteTodo={(todoId) => {
            // Långtryck i "bollar i tråd" (Sprint 6 S4) markerar en todo klar på ett
            // barns vägnar. Samma etablerade mönster som ChildDashboards onCompleteTodo
            // nedan: skickar med den TILLDELADE medlemmen (inte den inloggade föräldern)
            // som canCompleteTodo/completeTodo kontrollerar behörighet mot.
            // Familjen-tråden (2026-07-23) har ingen tilldelad medlem alls
            // (assignedTo===null) — faller då tillbaka på currentMember, den
            // faktiskt inloggade personen som utför handlingen (shared/
            // permissions.ts:s canCompleteTodo tillåter vem som helst att
            // slutföra en otilldelad todo, så vilken riktig medlem som helst
            // duger här).
            const todo = todos.find((t) => t.id === todoId);
            const assignee = todo?.assignedTo === null ? currentMember : members.find((m) => m.id === todo?.assignedTo);
            if (assignee) onCompleteTodo(assignee, todoId, roles);
          }}
          personalCategories={personalCategories}
          onCreateCategory={onCreateCategory}
          onRenameCategory={onRenameCategory}
          onRemoveCategory={onRemoveCategory}
          onSetCategoryHidden={onSetCategoryHidden}
          taskTemplates={taskTemplates}
          categoryTemplates={categoryTemplates}
          onCreateTaskTemplate={onCreateTaskTemplate}
          onCreateCategoryTemplate={onCreateCategoryTemplate}
          onUpdateCategoryTemplate={onUpdateCategoryTemplate}
          onSoftDeleteTodo={onSoftDeleteTodo}
          onApproveWish={onApproveWish}
          onRejectWish={onRejectWish}
          onSetWishStars={onSetWishStars}
        />
      </Suspense>
    );
  }

  if (activePanel === "recipes") {
    return (
      <Suspense fallback={null}>
        <RecipesView
          currentMember={currentMember}
          defaultShoppingListId={defaultRecipeShoppingListId}
          onAddShoppingItem={onAddShoppingItem}
          onCreateShoppingList={onCreateShoppingList}
          onCreateTodo={onCreateTodo}
          onCreateRecipe={onCreateRecipe}
          onRemoveRecipe={onRemoveRecipe}
          onUpdateRecipe={onUpdateRecipe}
          recipes={recipes}
          shoppingLists={canSeeShopping ? shoppingLists : []}
        />
      </Suspense>
    );
  }

  // ── Hem-panel ─────────────────────────────────────────────────────────────
  // Valt barn hanteras redan högst upp i funktionen (gäller alla paneler) —
  // härifrån och ner rör det sig bara om Hem utan valt barn.

  // Vald vuxen → hemvy för den personen (bara på Medlemmar-panelen, se
  // motiveringen vid barn-/själv-checken ovan — samma skydd mot gammal
  // persisterad lastActivePanel:"home"-data).
  if (selectedDashboardMember && activePanel === "members") {
    return (
      <HomePage
        key={selectedDashboardMember.id}
        currentMember={selectedDashboardMember}
        accountName={accountName}
        roles={roles}
        activeMembers={activeMembers}
        selectedMemberId={selectedDashboardMember.id}
        calendars={canSeeCalendar ? calendars : []}
        canSeeCalendar={canSeeCalendar}
        calendarFilter={homeFilter}
        onSelectMember={onSelectMember}
        onOpenCalendar={() => onNavigate("calendar")}
        calendarSettings={calendarSettings}
        onAddEvent={onAddCalendarEvent}
        onUpdateEvent={onUpdateCalendarEvent}
        onDeleteEvent={onDeleteCalendarEvent}
        onLoadEventsForMonth={onLoadEventsForMonth}
        fixedCalendarTimes={fixedCalendarTimes}
        enableTabs={false}
      />
    );
  }

  // Lägg till en Familjen-uppgift i MITT EGET konto, "förinställd på
  // familjen" (2026-08-01, Zaidas önskemål) — cross-account/Familjeanslutning
  // har varsin egen onCreateTodo-koppling direkt i homeFamilyThreadSources
  // nedan (createCrossAccountTodo/createConnectionTodo), ingen gemensam
  // dirigering behövs längre.
  function handleCreateFamilyTodo(accountId: Id, title: string, visual: string | null) {
    onCreateTodo({
      id: `todo-${generateId()}`,
      accountId,
      title,
      createdBy: currentMember.id,
      assignedTo: null,
      isShared: false,
      status: "pending",
      starValue: 0,
      visual: { type: "lucide-icon", value: visual || "⭐" },
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
      rejectedReason: null,
      deletedAt: null,
      deletedBy: null,
      personalCategoryId: null,
      notes: null,
      subtasks: []
    });
  }

  // Ny inköpslista, förinställd på den valda familjen (2026-08-01) — ENDAST
  // mitt eget konto eller Mina familjekonton (se homeShoppingCreatableAccountIds
  // ovan för varför Familjeanslutningar aldrig är ett giltigt mål här).
  function handleCreateFamilyShoppingList(accountId: Id, name: string) {
    if (accountId === currentMember.accountId) {
      onCreateShoppingList(name, null);
      return;
    }
    createCrossAccountList(accountId, name, null);
  }

  // Ingen vald → översikten
  return (
    <>
      <HomePage
        currentMember={currentMember}
        accountName={accountName}
        roles={roles}
        activeMembers={activeMembers}
        selectedMemberId=""
        calendars={canSeeCalendar ? calendars : []}
        canSeeCalendar={canSeeCalendar}
        calendarFilter={homeFilter}
        onSelectMember={onSelectMember}
        onOpenCalendar={() => onNavigate("calendar")}
        calendarSettings={calendarSettings}
        onAddEvent={onAddCalendarEvent}
        onUpdateEvent={onUpdateCalendarEvent}
        onDeleteEvent={onDeleteCalendarEvent}
        onLoadEventsForMonth={onLoadEventsForMonth}
        fixedCalendarTimes={fixedCalendarTimes}
        canSeeTodos={canSeeTodos}
        onOpenTodos={() => onNavigate("todos")}
        shoppingLists={homeAllShoppingLists}
        canSeeShopping={canSeeShopping}
        onOpenShopping={() => onNavigate("shopping")}
        canSeeMembers={canSeeMembers}
        familyOptions={homeFamilyOptions}
        extraMembers={homeExtraMembers}
        recipes={recipes}
        crossAccountRecipeGroups={crossAccountRecipeGroups}
        homeSelectedFamilyId={homeSelectedFamilyId}
        onUpdateHomeSelectedFamilyId={onUpdateHomeSelectedFamilyId}
        familyThreadSources={homeFamilyThreadSources}
        todoBubbleOrder={todoBubbleOrder}
        onReorderBubbles={onReorderBubbles}
        todoThreadGap={todoThreadGap}
        todoBubbleSize={todoBubbleSize}
        onCreateFamilyShoppingList={handleCreateFamilyShoppingList}
        shoppingCreatableFamilyAccountIds={homeShoppingCreatableAccountIds}
      />
      {children.length === 0 && canManageMembers && (
        <article className="dashboard" style={{ marginTop: "18px" }}>
          <header className="section-header">
            <div><p className="eyebrow">Familj</p><h2>Lägg till barn</h2></div>
          </header>
          <p className="empty-note">Öppna inställningar för att bjuda in ett barn.</p>
        </article>
      )}
    </>
  );
}
