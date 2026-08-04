import { useMemo, useState } from "react";
import { CalendarDays, CheckSquare, Plus, Search, ShoppingCart, Upload, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CalendarView } from "../calendars/CalendarView";
import type { CalendarFilter } from "../calendars/CalendarView";
import { MemberAvatar } from "../../components/MemberAvatar";
import { WeeklyMealPlan } from "../mealplan/WeeklyMealPlan";
import { FamilyTodoThreads } from "../todos/FamilyTodoThreads";
import type { FamilyThreadSource } from "../todos/FamilyTodoThreads";
import { SharedChildrenThreads } from "../todos/SharedChildrenThreads";
import { SharedShoppingLists } from "../shopping/SharedShoppingLists";
import { ConnectionRecipesSection } from "../recipes/ConnectionRecipesSection";
import { TodoImportExport } from "../todos/TodoImportExport";
import type { ImportResult, ImportUndo } from "../todos/useTodosState";
import type { CrossAccountRecipes } from "../../api/recipes";
import type {
  Calendar, CalendarEvent, CalendarSettings, Id, Member, MembershipMemberSummary, Recipe, Role, ShoppingList,
  Todo, TodoCategory, TodoThreadRange
} from "@shared/types";
import styles from "./MemberOverview.module.css";

// Hem-vyns familjefilter (2026-07-31, Zaidas önskemål: "om jag väljer en
// familj, då vill jag att endast den familjens kalenderhändelser, todos och
// medlemmar visas, men möjlighet att välja samtliga familjer så att allt
// visas i hemvyn") — en medlem från en annan familj (cross-account/
// Familjeanslutning) kommer bara som en MembershipMemberSummary, aldrig en
// fullständig Member, taggad med källfamiljens accountId.
type ExtraMember = MembershipMemberSummary & { accountId: Id };
type FamilyOption = { accountId: Id; accountName: string };

// Fyra flikval bredvid familjeväljaren (2026-07-31, Zaidas önskemål:
// "bredvid den väljaren på samma rad skall ikoner visas så att man kan
// trycka på dessa och se familjens kalender, inköpslista, todos samt en
// måltidsplanering") — ersätter det tidigare "visa allt staplat"-läget:
// bara EN sektion visas åt gången. Medlemmar-kortet (inte en av de fyra
// ikonerna Zaida räknade upp) förblir alltid synligt ovanför, oberoende av
// vald flik.
type HomeTab = "calendar" | "shopping" | "todos" | "mealplan";

type Props = {
  currentMember: Member;
  accountName: string;
  roles: Role[];
  activeMembers: Member[];
  selectedMemberId: string;
  calendars: Calendar[];
  canSeeCalendar: boolean;
  calendarFilter?: CalendarFilter;
  onSelectMember: (memberId: string) => void;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  calendarSettings?: CalendarSettings;
  onLoadEventsForMonth?: (year: number, month: number) => Promise<void>;
  fixedCalendarTimes?: boolean;
  canSeeTodos?: boolean;
  onOpenTodos?: () => void;
  shoppingLists?: ShoppingList[];
  canSeeShopping?: boolean;
  onOpenShopping?: () => void;
  canSeeMembers?: boolean;
  // Familjefilter (2026-07-31) — familyOptions inkluderar redan mitt eget
  // konto (satt av MemberShellContent.tsx), så listan här är den KOMPLETTA
  // uppsättningen att välja mellan. extraMembers är andra familjers
  // medlemmar (cross-account + Familjeanslutningar), redan taggade med sin
  // egen accountId. calendars/todos/shoppingLists har redan .accountId satt
  // av backend (både egna och delade), ingen extra taggning behövs.
  familyOptions?: FamilyOption[];
  extraMembers?: ExtraMember[];
  // Måltidsplanering (2026-07-31, utökad 2026-08-01 till Mina familjekonton
  // — Zaidas rättelse: "man ska inte heller kunna planera måltider med
  // andra familjer, utan då måste man först göra en familj med dessa
  // familjer som medlemmar", ALDRIG en Familjeanslutning) — se WeeklyMealPlan.tsx.
  recipes?: Recipe[];
  crossAccountRecipeGroups?: CrossAccountRecipes[];
  // Senast valda familj, sparad server-side (Zaidas önskemål: "jag vill att
  // den sparar det jag senast valde"). null/osatt = "Alla familjer".
  homeSelectedFamilyId?: Id | null;
  onUpdateHomeSelectedFamilyId?: (id: Id | null) => void;
  // Hem-vyns familjetrådar (2026-08-01, Zaidas önskemål: "hemvyn skall vara
  // återanvändbara moduler med samma logik som i navbarens vyer... man skall
  // signa upp sig på en uppgift på samma sätt som i todovyn med bollar i
  // trådar. två tryck för att tilldela, tre tryck för att flytta") —
  // FamilyTodoThreads.tsx återanvänder samma bubbel-gester/kategorimeny-
  // delmängd som ParentTodoThreadView.tsx, en tråd per källa (redan
  // hopkopplad med rätt mutationer, se MemberShellContent.tsx).
  familyThreadSources?: FamilyThreadSource[];
  todoBubbleOrder?: Record<Id, Id[]>;
  onReorderBubbles?: (threadId: Id, order: Id[]) => void;
  todoThreadGap?: number;
  todoBubbleSize?: number;
  // Tidsspann (2026-08-04, Zaidas fynd) — samma Inställningar → Utseende-
  // inställning som redan gäller den personliga Todos-panelens trådar.
  todoThreadRange?: TodoThreadRange;
  // Ny inköpslista, förinställd på familjen (2026-08-01) — ENDAST mitt eget
  // konto eller Mina familjekonton (Zaidas rättelse: "man ska inte kunna
  // göra inköpslistor i familjer man inte är medlem i").
  onCreateFamilyShoppingList?: (accountId: Id, name: string) => void;
  shoppingCreatableFamilyAccountIds?: Set<Id>;
  // Sökruta + "+"-knapp (ny familjekategori) + massimport/export av
  // familjens uppgifter (2026-08-03, Zaidas önskemål: "en sökruta och en
  // plusknapp där jag kan lägga till kategorier och uppgifter... kunna
  // massimportera och exportera, samt kunna massradera") — bara relevant
  // för MITT EGET konto (isOwnFamilySelected nedan), aldrig en annan familj
  // jag bara tittar på.
  members?: Member[];
  categories?: TodoCategory[];
  onCreateCategory?: (name: string, isFamily?: boolean) => Promise<TodoCategory>;
  onCreateTodo?: (todo: Todo) => void;
  onUpdateTodo?: (todoId: Id, patch: Partial<Todo>) => void;
  onDeleteTodo?: (todoId: Id) => void;
  todoImportResult?: ImportResult | null;
  onSetTodoImportResult?: (result: ImportResult | null) => void;
  todoImportUndo?: ImportUndo | null;
  onSetTodoImportUndo?: (undo: ImportUndo | null) => void;
  // Flik-/familjeväljaren gäller bara den RIKTIGA Hem-översikten (2026-08-01,
  // fynd vid samma dags Todos/familjevy-arbete) — "vald vuxen"-vyn
  // (MemberShellContent.tsx, en annan medlems kalender via Medlemmar-panelen)
  // återanvänder samma komponent men ska visa bara kalendern, precis som
  // innan flik-ombyggnaden, utan att kollidera med huvudnavets "Kalender"-
  // knapp (samma namn som den nya "Visa kalender"-flikknappen).
  enableTabs?: boolean;
};

export function MemberOverview({
  currentMember,
  accountName,
  roles,
  activeMembers,
  calendars,
  canSeeCalendar,
  calendarFilter,
  onSelectMember,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  calendarSettings,
  onLoadEventsForMonth,
  fixedCalendarTimes,
  canSeeTodos = false,
  onOpenTodos,
  shoppingLists = [],
  canSeeShopping = false,
  onOpenShopping,
  canSeeMembers = false,
  familyOptions = [],
  extraMembers = [],
  recipes = [],
  crossAccountRecipeGroups = [],
  homeSelectedFamilyId,
  onUpdateHomeSelectedFamilyId,
  familyThreadSources = [],
  todoBubbleOrder = {},
  onReorderBubbles = () => {},
  todoThreadGap,
  todoBubbleSize,
  todoThreadRange = "today",
  onCreateFamilyShoppingList,
  shoppingCreatableFamilyAccountIds,
  members = [],
  categories = [],
  onCreateCategory,
  onCreateTodo,
  onUpdateTodo,
  onDeleteTodo,
  todoImportResult = null,
  onSetTodoImportResult,
  todoImportUndo = null,
  onSetTodoImportUndo,
  enableTabs = true,
}: Props) {
  const ownAccountId = currentMember.accountId;
  const [selectedFamilyId, setSelectedFamilyIdState] = useState<Id | "all">(() => homeSelectedFamilyId ?? "all");
  const [activeTab, setActiveTab] = useState<HomeTab>("calendar");
  const [newListName, setNewListName] = useState("");
  // Sökruta + "+"-knapp (ny familjekategori) + import/export-panel
  // (2026-08-03) — se Props-kommentaren ovan.
  const [todoSearchQuery, setTodoSearchQuery] = useState("");
  const [addingFamilyCategory, setAddingFamilyCategory] = useState(false);
  const [newFamilyCategoryName, setNewFamilyCategoryName] = useState("");
  const [showFamilyImportExport, setShowFamilyImportExport] = useState(false);

  function setSelectedFamilyId(id: Id | "all") {
    setSelectedFamilyIdState(id);
    onUpdateHomeSelectedFamilyId?.(id === "all" ? null : id);
  }

  // Medvetet INGET "återställ till Alla familjer om valet inte finns bland
  // options"-säkerhetsnät här (ett tidigare försök togs bort igen samma
  // dag) — familyOptions byggs upp asynkront av flera hookar (cross-account/
  // Familjeanslutningar), så ett sådant nät triggade felaktigt på VARJE
  // sidladdning under det korta fönstret innan de hunnit svara, och skrev
  // därmed över en precis inläst, giltig persisterad familj (homeSelectedFamilyId)
  // med "all" innan användaren ens hunnit se den. Väljer man en familj som
  // sedan faktiskt tagits bort (en återkallad Familjeanslutning) visar
  // <select> bara ett värde utan matchande <option> — ofarligt, användaren
  // väljer om manuellt.
  const familyNameById = useMemo(
    () => new Map(familyOptions.map((f) => [f.accountId, f.accountName])),
    [familyOptions]
  );
  const showFamilyFilter = familyOptions.length > 1;
  const isOwnFamilySelected = selectedFamilyId === "all" || selectedFamilyId === ownAccountId;

  const filteredCalendars = useMemo(
    () => (selectedFamilyId === "all" ? calendars : calendars.filter((c) => c.accountId === selectedFamilyId)),
    [calendars, selectedFamilyId]
  );

  const filteredShoppingLists = useMemo(
    () =>
      selectedFamilyId === "all"
        ? shoppingLists
        : shoppingLists.filter((l) => (l.accountId ?? ownAccountId) === selectedFamilyId),
    [shoppingLists, selectedFamilyId, ownAccountId]
  );

  // Familjetrådar filtrerade på vald familj (2026-08-01) — "Alla familjer"
  // visar samtliga sida vid sida, precis som Todos-panelens egna trådar.
  const filteredThreadSources = useMemo(
    () =>
      selectedFamilyId === "all"
        ? familyThreadSources
        : familyThreadSources.filter((s) => s.accountId === selectedFamilyId),
    [familyThreadSources, selectedFamilyId]
  );
  const pendingTodoCount = filteredThreadSources.reduce(
    (sum, s) => sum + s.todos.filter((t) => t.status === "pending").length,
    0
  );
  // Massimport/export (2026-08-03) — bara MITT EGET kontos familje-trådar
  // (Familjen-poolen + egna familjekategorier), oavsett vilket familjeval
  // som råkar vara aktivt i filtret ovan (own/familyCategoryThreads i
  // MemberShellContent.tsx delar redan upp homeVisibleTodos utan
  // dubbelräkning — flatMap:as här tillbaka till en enda lista).
  const localFamilyTodos = useMemo(
    () => familyThreadSources.filter((s) => s.accountId === ownAccountId).flatMap((s) => s.todos),
    [familyThreadSources, ownAccountId]
  );
  // Mitt eget konto + Mina familjekonton (genuint medlemskap, "vem håller på
  // med den här" tillgänglig) — en Familjeanslutning har aldrig
  // onToggleInProgress, se homeFamilyThreadSources i MemberShellContent.tsx.
  const identityAccountIds = useMemo(
    () => new Set(familyThreadSources.filter((s) => s.onToggleInProgress).map((s) => s.accountId)),
    [familyThreadSources]
  );
  const activeLists = filteredShoppingLists.filter((l) => l.deletedAt === null);
  const activeFamilyMembers = activeMembers.filter((m) => m.deletedAt === null);

  const filteredMembers = useMemo(() => {
    const own = activeFamilyMembers.map((m) => ({ ...m, accountId: ownAccountId, isOwn: true as const }));
    const extra = extraMembers.map((m) => ({ ...m, isOwn: false as const }));
    if (selectedFamilyId === "all") return [...own, ...extra];
    if (selectedFamilyId === ownAccountId) return own;
    return extra.filter((m) => m.accountId === selectedFamilyId);
  }, [activeFamilyMembers, extraMembers, ownAccountId, selectedFamilyId]);

  // aria-label prefixad "Visa..." (2026-07-31) — huvudnavigeringen (HeroBar)
  // har egna knappar med samma korta namn ("Kalender"/"Inköp"/"Todos"), en
  // krock annars för både skärmläsare och tester.
  const allTabs: { key: HomeTab; label: string; icon: LucideIcon; enabled: boolean }[] = [
    { key: "calendar", label: "Visa kalender", icon: CalendarDays, enabled: canSeeCalendar },
    { key: "shopping", label: "Visa inköpslista", icon: ShoppingCart, enabled: canSeeShopping },
    { key: "todos", label: "Visa todos", icon: CheckSquare, enabled: canSeeTodos },
    { key: "mealplan", label: "Visa måltidsplanering", icon: UtensilsCrossed, enabled: true }
  ];
  const tabs = allTabs.filter((t) => t.enabled);
  // "vald vuxen"-vyn (enableTabs=false) visar alltid bara kalendern, oavsett
  // vilken flik som råkar ligga i state sedan tidigare (samma instans kan
  // återanvändas, se `key`-propen i MemberShellContent.tsx).
  const effectiveTab = enableTabs ? activeTab : "calendar";

  return (
    <div className={styles.home}>
      {enableTabs && (
      <div className={styles.controlRow}>
        {showFamilyFilter && (
          <label className="field-label" htmlFor="home-family-select" style={{ maxWidth: 220 }}>
            Familj
            <select
              className="text-input"
              id="home-family-select"
              onChange={(e) => setSelectedFamilyId(e.target.value as Id | "all")}
              value={selectedFamilyId}
            >
              <option value="all">Alla familjer</option>
              {familyOptions.map((f) => (
                <option key={f.accountId} value={f.accountId}>{f.accountName}</option>
              ))}
            </select>
          </label>
        )}
        <div className={styles.tabRow} role="tablist">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              aria-label={label}
              aria-pressed={activeTab === key}
              className={`${styles.tabButton} ${activeTab === key ? styles.tabButtonActive : ""}`}
              key={key}
              onClick={() => setActiveTab(key)}
              title={label}
              type="button"
            >
              <Icon size={20} />
            </button>
          ))}
        </div>
      </div>
      )}

      {canSeeMembers && filteredMembers.length > 0 && (
        <article className="dashboard">
          <header className="section-header">
            <div><p className="eyebrow">{accountName}</p><h2>Medlemmar</h2></div>
          </header>
          <div className={styles.memberRow}>
            {filteredMembers.map((m) =>
              m.isOwn ? (
                <button
                  className={styles.memberButton}
                  key={m.id}
                  onClick={() => onSelectMember(m.id)}
                  title={m.name}
                  type="button"
                >
                  <MemberAvatar member={m} size="small" />
                  <span>{m.name}</span>
                </button>
              ) : (
                <div
                  className={`${styles.memberButton} ${styles["memberButton--static"]}`}
                  key={`${m.accountId}-${m.id}`}
                  title={m.name}
                >
                  <MemberAvatar member={m} size="small" />
                  <span>{m.name}</span>
                  {selectedFamilyId === "all" && (
                    <small>{familyNameById.get(m.accountId) ?? "Okänd familj"}</small>
                  )}
                </div>
              )
            )}
          </div>
        </article>
      )}

      {effectiveTab === "calendar" && canSeeCalendar && (
        <div className={styles.calendarWrap}>
          <div className={styles.calendarToolbar}>
            <span className={styles.calendarLabel}>Familjens kalender</span>
          </div>
          <CalendarView
            displayOnly
            calendars={filteredCalendars}
            currentMember={currentMember}
            activeMembers={activeMembers}
            roles={roles}
            calendarSettings={calendarSettings}
            filter={calendarFilter}
            onAddEvent={onAddEvent}
            onUpdateEvent={onUpdateEvent}
            onDeleteEvent={onDeleteEvent}
            onMonthChange={onLoadEventsForMonth}
            fixedCalendarTimes={fixedCalendarTimes}
          />
        </div>
      )}

      {effectiveTab === "todos" && canSeeTodos && (
        <article className="dashboard">
          <header className="section-header">
            <div><p className="eyebrow">Uppgifter</p><h2>{pendingTodoCount} väntar</h2></div>
            {onOpenTodos && (
              <button className="secondary-button" onClick={onOpenTodos} type="button">Öppna</button>
            )}
          </header>

          {/* Sökruta + "+" (ny familjekategori) + import/export (2026-08-03)
              — bara för mitt EGET konto, aldrig en annan familj jag bara
              tittar på via filtret ovan. */}
          {isOwnFamilySelected && onCreateCategory && (
            <div className={styles.homeQuickAdd}>
              <label aria-label="Sök bland familjens uppgifter" className={styles.todoSearchLabel}>
                <Search aria-hidden="true" size={16} />
                <input
                  className="text-input"
                  onChange={(e) => setTodoSearchQuery(e.target.value)}
                  placeholder="Sök bland familjens uppgifter…"
                  type="search"
                  value={todoSearchQuery}
                />
              </label>
              <button
                aria-label="Ny familjekategori"
                className="icon-button"
                onClick={() => { setAddingFamilyCategory((v) => !v); setNewFamilyCategoryName(""); }}
                title="Ny familjekategori"
                type="button"
              >
                <Plus size={18} />
              </button>
              <button
                aria-expanded={showFamilyImportExport}
                aria-label="Importera/exportera familjens uppgifter"
                className="icon-button"
                onClick={() => setShowFamilyImportExport((v) => !v)}
                title="Importera/exportera"
                type="button"
              >
                <Upload size={18} />
              </button>
            </div>
          )}

          {addingFamilyCategory && onCreateCategory && (
            <form
              className={styles.homeQuickAdd}
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newFamilyCategoryName.trim();
                if (!trimmed) return;
                onCreateCategory(trimmed, true);
                setNewFamilyCategoryName("");
                setAddingFamilyCategory(false);
              }}
            >
              <input
                aria-label="Namn på ny familjekategori"
                autoFocus
                className="text-input"
                onChange={(e) => setNewFamilyCategoryName(e.target.value)}
                placeholder="Namn på ny familjekategori…"
                value={newFamilyCategoryName}
              />
              <button aria-label="Skapa familjekategori" className="icon-button" type="submit">
                <Plus size={18} />
              </button>
            </form>
          )}

          {isOwnFamilySelected && showFamilyImportExport && onCreateTodo && onUpdateTodo && onDeleteTodo && onCreateCategory && (
            <TodoImportExport
              categories={categories}
              currentMember={currentMember}
              lastImportUndo={todoImportUndo ?? null}
              members={members}
              onCreateCategory={onCreateCategory}
              onCreateTodo={onCreateTodo}
              onDeleteTodo={onDeleteTodo}
              onUpdateTodo={onUpdateTodo}
              result={todoImportResult ?? null}
              roles={roles}
              scope="family"
              setLastImportUndo={onSetTodoImportUndo ?? (() => {})}
              setResult={onSetTodoImportResult ?? (() => {})}
              todos={localFamilyTodos}
            />
          )}

          {filteredThreadSources.length === 0 ? (
            <p className="empty-note">Inget väntar just nu.</p>
          ) : (
            <FamilyTodoThreads
              onReorderBubbles={onReorderBubbles}
              range={todoThreadRange}
              searchQuery={todoSearchQuery}
              sources={filteredThreadSources}
              todoBubbleOrder={todoBubbleOrder}
              todoBubbleSize={todoBubbleSize}
              todoThreadGap={todoThreadGap}
            />
          )}

          {/* Delade barn (ADR-0024, 2026-07-22) — flyttad hit från
              Todos-panelen (2026-08-01, Zaidas rättelse: "de skall endast
              synas i hemvyn"), oförändrad komponent/logik. Ett barn en
              ANNAN vuxen (i din familj eller en helt annan) delat med dig
              — visas oavsett vald familj i filtret ovan (en delning är inte
              knuten till ett specifikt familjekonto-val på samma sätt). */}
          <SharedChildrenThreads todoBubbleSize={todoBubbleSize} todoThreadGap={todoThreadGap} />
        </article>
      )}

      {effectiveTab === "shopping" && canSeeShopping && (
        <article className="dashboard">
          <header className="section-header">
            <div><p className="eyebrow">Inköp</p><h2>{activeLists.length} listor</h2></div>
            {onOpenShopping && (
              <button className="secondary-button" onClick={onOpenShopping} type="button">Öppna</button>
            )}
          </header>

          {/* Ny lista, förinställd på den valda familjen (2026-08-01) —
              ENDAST familjer jag är en riktig medlem av (mitt eget konto
              eller Mina familjekonton), aldrig en Familjeanslutning. */}
          {onCreateFamilyShoppingList && selectedFamilyId !== "all" && shoppingCreatableFamilyAccountIds?.has(selectedFamilyId) && (
            <form
              className={styles.homeQuickAdd}
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newListName.trim();
                if (!trimmed) return;
                onCreateFamilyShoppingList(selectedFamilyId, trimmed);
                setNewListName("");
              }}
            >
              <input
                aria-label="Lägg till en inköpslista"
                className="text-input"
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Lägg till en inköpslista…"
                value={newListName}
              />
              <button aria-label="Lägg till inköpslista" className="icon-button" type="submit">
                <Plus size={18} />
              </button>
            </form>
          )}

          {activeLists.length === 0 ? (
            <p className="empty-note">Inga inköpslistor ännu.</p>
          ) : (
            <div className={styles.shoppingLists}>
              {activeLists.map((l) => {
                const activeItems = l.items.filter((i) => i.deletedAt === null);
                const remaining = activeItems.filter((i) => !i.done).length;
                return (
                  <div className={styles.shoppingList} key={l.id}>
                    <header>
                      <strong>{l.name}</strong>
                      <span>
                        {remaining} kvar
                        {selectedFamilyId === "all" && l.accountId && l.accountId !== ownAccountId && (
                          <small> · {familyNameById.get(l.accountId) ?? "Okänd familj"}</small>
                        )}
                      </span>
                    </header>
                    {activeItems.length === 0 ? (
                      <p className="empty-note">Tom lista.</p>
                    ) : (
                      <ul>
                        {activeItems.map((item) => (
                          <li className={item.done ? styles.shoppingItemDone : ""} key={item.id}>{item.title}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* En annan familjs delade lista (ADR-0026, externalSharedWith) —
              flyttad hit från Inköp-panelen (2026-08-01, Zaidas rättelse: "de
              skall endast synas i hemvyn"), oförändrad komponent/logik. */}
          <SharedShoppingLists currentMember={currentMember} />
        </article>
      )}

      {effectiveTab === "mealplan" && (
        isOwnFamilySelected ? (
          <article className="dashboard">
            <header className="section-header">
              <div><p className="eyebrow">Måltidsplanering</p><h2>Den här veckan</h2></div>
            </header>
            <WeeklyMealPlan recipes={recipes} />
            {/* En ansluten familjs receptbok (ADR-0030, dataScope.recipes) —
                flyttad hit från Recept-panelen (2026-08-01, Zaidas rättelse:
                "de skall endast synas i hemvyn"), oförändrad komponent/logik. */}
            <ConnectionRecipesSection />
          </article>
        ) : identityAccountIds.has(selectedFamilyId) ? (
          // Ett av Mina familjekonton (2026-08-01, Zaidas önskemål) — ett
          // genuint medlemskap, samma identityAccountIds-princip som
          // Todos-flikens signa-upp-gest. ALDRIG en Familjeanslutning (Zaidas
          // rättelse: "man måste först göra en familj med dessa familjer
          // som medlemmar").
          <article className="dashboard">
            <header className="section-header">
              <div><p className="eyebrow">Måltidsplanering</p><h2>Den här veckan</h2></div>
            </header>
            <WeeklyMealPlan
              recipes={crossAccountRecipeGroups.find((g) => g.accountId === selectedFamilyId)?.recipes ?? []}
              targetAccountId={selectedFamilyId}
            />
          </article>
        ) : (
          <article className="dashboard">
            <header className="section-header">
              <div><p className="eyebrow">Måltidsplanering</p><h2>Inte tillgängligt</h2></div>
            </header>
            <p className="empty-note">
              Måltidsplanering kräver att du är en riktig medlem av familjen (Mina familjekonton) — en
              Familjeanslutning räcker inte.
            </p>
          </article>
        )
      )}
    </div>
  );
}
