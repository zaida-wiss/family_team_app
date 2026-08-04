import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CheckSquare, Plus, ShoppingCart, Upload, UtensilsCrossed, Users } from "lucide-react";
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
  // "+"-knapp (ny familjekategori) + import/export-panel (2026-08-03) — se
  // Props-kommentaren ovan.
  const [addingFamilyCategory, setAddingFamilyCategory] = useState(false);
  const [newFamilyCategoryName, setNewFamilyCategoryName] = useState("");
  const [showFamilyImportExport, setShowFamilyImportExport] = useState(false);
  // Medlemsikonen (2026-08-04, Zaidas fynd: "medlemmarna tar för stor plats
  // i hemvyn") — ersätter den tidigare alltid-synliga raden av avatarer med
  // EN ikon (samma dropdown-framför-lång-lista-princip som CLAUDE.md redan
  // föreskriver) som öppnar en portalad lista, samma mönster som
  // ParentTodoThreadView.tsx:s kategorimeny (fixed position, stängs vid
  // klick utanför).
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberPickerPos, setMemberPickerPos] = useState({ top: 0, left: 0 });
  const memberIconRef = useRef<HTMLButtonElement>(null);
  const memberPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!memberPickerOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (memberPickerRef.current?.contains(e.target as Node)) return;
      if (memberIconRef.current?.contains(e.target as Node)) return;
      setMemberPickerOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMemberPickerOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [memberPickerOpen]);

  function toggleMemberPicker() {
    if (!memberPickerOpen && memberIconRef.current) {
      const rect = memberIconRef.current.getBoundingClientRect();
      const POPUP_WIDTH = 220;
      // Uppskattad höjd (ingen exakt känd innan render) — räcker för att
      // avgöra om popupen ska öppnas neråt eller uppåt. På mobil ligger
      // ikonen numera i den fasta bottenraden (se .controlRow ovanför HeroBar,
      // 2026-08-04) — under-plats saknas då nästan alltid, precis som
      // HeroBar.tsx:s egen NavMemberPicker redan hanterar samma problem
      // genom att öppna uppåt på mobil.
      const ESTIMATED_HEIGHT = Math.min(filteredMembers.length * 48 + 12, 300);
      const openUpward = window.innerHeight - rect.bottom < ESTIMATED_HEIGHT + 8;
      setMemberPickerPos({
        top: openUpward ? Math.max(8, rect.top - ESTIMATED_HEIGHT - 4) : rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 8)
      });
    }
    setMemberPickerOpen((v) => !v);
  }

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

  // Medlemmar (2026-08-04, Zaidas önskemål: "Medlemmar skall visas
  // tillsammans med familj och knappar, tänk minimalistiskt", utökat samma
  // dag efter fynd: "medlemmarna tar för stor plats i hemvyn, ska vi sätta
  // en ikon för medlemmar där istället?") — EN ikon (samma tabButton-stil
  // som flikarna) öppnar en portalad lista istället för att visa varje
  // avatar inline hela tiden. Egna medlemmar väljbara, andra familjers
  // (cross-account/Familjeanslutning) statiska med familjenamn under.
  const memberRow = canSeeMembers && filteredMembers.length > 0 && (
    <>
      <button
        aria-expanded={memberPickerOpen}
        aria-label="Visa medlemmar"
        className={styles.tabButton}
        onClick={toggleMemberPicker}
        ref={memberIconRef}
        title="Visa medlemmar"
        type="button"
      >
        <Users size={18} />
      </button>
      {memberPickerOpen &&
        createPortal(
          <div
            aria-label="Medlemslista"
            className={styles.memberPopup}
            ref={memberPickerRef}
            role="group"
            style={{ position: "fixed", top: memberPickerPos.top, left: memberPickerPos.left }}
          >
            {filteredMembers.map((m) =>
              m.isOwn ? (
                <button
                  className={styles.memberPopupRow}
                  key={m.id}
                  onClick={() => { onSelectMember(m.id); setMemberPickerOpen(false); }}
                  type="button"
                >
                  <MemberAvatar member={m} size="small" />
                  <span>{m.name}</span>
                </button>
              ) : (
                <div className={`${styles.memberPopupRow} ${styles["memberPopupRow--static"]}`} key={`${m.accountId}-${m.id}`}>
                  <MemberAvatar member={m} size="small" />
                  <span>
                    {m.name}
                    {selectedFamilyId === "all" && (
                      <small>{familyNameById.get(m.accountId) ?? "Okänd familj"}</small>
                    )}
                  </span>
                </div>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );

  return (
    <div className={styles.home}>
      {enableTabs ? (
        <div className={styles.controlRow}>
          {showFamilyFilter && (
            <label className={`field-label ${styles.familyLabel}`} htmlFor="home-family-select" style={{ maxWidth: 220 }}>
              <span className={styles.srOnly}>Familj</span>
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
          {memberRow}
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
                <Icon size={18} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        memberRow
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
          {/* "+" (ny familjekategori) + import/export (2026-08-03, sökruta/
              titel/väntar-antal/Öppna-knapp borttagna 2026-08-04, Zaidas
              önskemål: "lägg ikonerna... och knapparna... bredvid varandra.
              Ta bort filtreringen och öppnasektionen") — bara för mitt EGET
              konto, aldrig en annan familj jag bara tittar på via filtret
              ovan. */}
          {isOwnFamilySelected && onCreateCategory && (
            <div className={styles.homeQuickAdd}>
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
