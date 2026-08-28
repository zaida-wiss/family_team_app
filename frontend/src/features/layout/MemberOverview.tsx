import { useMemo, useState } from "react";
import type { ClipboardEvent } from "react";
import { CalendarDays, Check, CheckSquare, Plus, Settings, ShoppingCart, Trash2, Upload, User, UtensilsCrossed, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CalendarView } from "../calendars/CalendarView";
import type { CalendarFilter } from "../calendars/CalendarView";
import { MemberAvatar } from "../../components/MemberAvatar";
import { WeeklyMealPlan } from "../mealplan/WeeklyMealPlan";
import { FamilyTodoThreads } from "../todos/FamilyTodoThreads";
import type { FamilyThreadSource } from "../todos/FamilyTodoThreads";
import { SharedChildrenThreads } from "../todos/SharedChildrenThreads";
import { SharedCategoryThreads } from "../todos/SharedCategoryThreads";
import { SharedShoppingLists } from "../shopping/SharedShoppingLists";
import { splitPastedShoppingItems } from "../shopping/parseShoppingPaste";
import { ConnectionRecipesSection } from "../recipes/ConnectionRecipesSection";
import { TodoImportExport } from "../todos/TodoImportExport";
import { FamilyCompletedTimeline } from "../todos/FamilyCompletedTimeline";
import { generateId } from "../../utils/uuid";
import type { ImportResult, ImportUndo } from "../todos/useTodosState";
import type { CrossAccountRecipes } from "../../api/recipes";
import type {
  AppPanel, Calendar, CalendarEvent, CalendarSettings, Id, Member, MembershipMemberSummary, Recipe, Role, ShoppingList,
  Todo, TodoCategory, TodoThreadRange
} from "@shared/types";
import styles from "./MemberOverview.module.css";
import shoppingStyles from "../shopping/ShoppingLists.module.css";

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
type HomeTab = "calendar" | "shopping" | "todos" | "mealplan" | "members";

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
  // Drag-and-drop-ordning på trådarna/kolumnerna själva (2026-08-05, Zaidas
  // önskemål om parity med den personliga Todos-panelen).
  familyThreadOrder?: Id[];
  onReorderFamilyThreads?: (order: Id[]) => void;
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
  // Redigerbara varor i familjens listvy (2026-08-16, Zaidas fynd: "Listor
  // måste gå att redigera i familjens listvy") — samma editable-gräns som
  // "ny lista"-formuläret ovan (shoppingCreatableFamilyAccountIds: mitt
  // eget konto + Mina familjekonton, ALDRIG en Familjeanslutning). Tar
  // hela listan (inte bara dess id) så anroparen (MemberShellContent.tsx)
  // kan avgöra om list.accountId är mitt eget konto eller ett av mina
  // andra — och därmed vilken av de två skilda API-vägarna som ska anropas.
  onToggleHomeShoppingItem?: (list: ShoppingList, itemId: Id) => void;
  onAddHomeShoppingItem?: (list: ShoppingList, title: string) => void;
  onDeleteHomeShoppingItem?: (list: ShoppingList, itemId: Id) => void;
  // Sökruta + "+"-knapp (ny familjekategori) + massimport/export av
  // familjens uppgifter (2026-08-03, Zaidas önskemål: "en sökruta och en
  // plusknapp där jag kan lägga till kategorier och uppgifter... kunna
  // massimportera och exportera, samt kunna massradera") — bara relevant
  // för MITT EGET konto (isOwnFamilySelected nedan), aldrig en annan familj
  // jag bara tittar på.
  members?: Member[];
  categories?: TodoCategory[];
  // Kontots HELA, ofiltrerade todo-lista (2026-08-06, Zaidas fynd: "en
  // uppgift som ändras via importera eller via modalen skall inte rendera
  // en ny, endast uppdatera befintlig") — SKILD från localFamilyTodos (som
  // redan filtrerats genom getFamilyViewTodos innan den når hit), bara
  // vidarebefordrad till TodoImportExport.tsx:s dubblettmatchning, aldrig
  // använd för export/visning här.
  allTodos?: Todo[];
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
  // Två navbarer, en i taget (2026-08-12, Zaidas beslut: "Växla mellan de
  // två navbarerna, personlig och familjer... tryck på en person (ikon)
  // från familjenavbaren för att komma till din personliga vy") — se
  // useShellState.ts:s homeShowFamilyNav-kommentar för hela bakgrunden.
  // Bara relevant när enableTabs är true (den riktiga Hem-vyn).
  homeShowFamilyNav?: boolean;
  onShowAppNav?: () => void;
  onNavigate?: (panel: AppPanel) => void;
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
  familyThreadOrder = [],
  onReorderFamilyThreads = () => {},
  todoThreadGap,
  todoBubbleSize,
  todoThreadRange = "today",
  onCreateFamilyShoppingList,
  shoppingCreatableFamilyAccountIds,
  onToggleHomeShoppingItem,
  onAddHomeShoppingItem,
  onDeleteHomeShoppingItem,
  members = [],
  categories = [],
  allTodos = [],
  onCreateCategory,
  onCreateTodo,
  onUpdateTodo,
  onDeleteTodo,
  todoImportResult = null,
  onSetTodoImportResult,
  todoImportUndo = null,
  onSetTodoImportUndo,
  enableTabs = true,
  homeShowFamilyNav = true,
  onShowAppNav,
  onNavigate,
}: Props) {
  const ownAccountId = currentMember.accountId;
  const [selectedFamilyId, setSelectedFamilyIdState] = useState<Id | "all">(() => homeSelectedFamilyId ?? "all");
  const [activeTab, setActiveTab] = useState<HomeTab>("calendar");
  // Ökas vid VARJE flikklick, oavsett om fliken faktiskt bytte värde
  // (2026-08-09, Zaidas önskemål, samma mönster som huvudnavets
  // panelNavResetKey i useAppState.ts) — ett klick på en redan aktiv flik
  // ändrar aldrig `activeTab`, så en enkel `key={effectiveTab}` på
  // flikinnehållet remountar aldrig av sig själv. Den här räknaren är en
  // TILLÄGGSDEL av samma key och tvingar fram en remount ändå, vilket
  // stänger en öppen modal (t.ex. en todo-detaljvy i FamilyTodoThreads,
  // eller ett kalenderhändelse-formulär i CalendarView) och nollställer
  // fliken till sin grundvy.
  const [tabResetKey, setTabResetKey] = useState(0);

  function handleTabClick(tab: HomeTab) {
    setActiveTab(tab);
    setTabResetKey((k) => k + 1);
  }
  const [newListName, setNewListName] = useState("");
  // Redigerbara varor i familjens listvy (2026-08-16) — draft-text per
  // lista, samma mönster som SharedShoppingLists.tsx:s egen draftItems.
  const [homeShoppingDraftItems, setHomeShoppingDraftItems] = useState<Record<Id, string>>({});
  // "+"-knapp (ny familjekategori) + import/export-panel (2026-08-03) — se
  // Props-kommentaren ovan.
  const [addingFamilyCategory, setAddingFamilyCategory] = useState(false);
  const [newFamilyCategoryName, setNewFamilyCategoryName] = useState("");
  // Uppgiftens titel (2026-08-05, Zaidas beslut: "aldrig bara en kategori")
  // — en ny familjekategori skapas nu alltid TILLSAMMANS med sin första
  // uppgift, i samma litet formulär (ingen egen stor Ny uppgift-modal finns
  // för familjeflödet att öppna direkt in i, till skillnad från den
  // personliga tråd-vyn).
  const [newFamilyCategoryTaskTitle, setNewFamilyCategoryTaskTitle] = useState("");
  // "Ingen kategori" (2026-08-07) — Familjen-poolen döljs nu när den är tom
  // (FamilyTodoThreads.tsx:s hideWhenEmpty), så dess egen "Lägg till
  // uppgift"-meny slutar vara nåbar för att lägga till den FÖRSTA
  // okategoriserade uppgiften. "+"-knappens formulär fick därför en genväg
  // hit istället — kryssrutan hoppar över kategoriskapandet helt.
  const [noFamilyCategory, setNoFamilyCategory] = useState(false);
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

  // Föräldrar/vuxna överst, barn underst (2026-08-12, Zaidas önskemål) —
  // stabil sortering (Array.prototype.sort är garanterat stabil sedan
  // ES2019), gruppen skiftar bara vuxna/barn inbördes ordning, ändrar inte
  // ordningen inom respektive grupp.
  const sortedMembers = useMemo(
    () => [...filteredMembers].sort((a, b) => Number(a.isChild) - Number(b.isChild)),
    [filteredMembers]
  );

  // aria-label prefixad "Visa..." (2026-07-31) — huvudnavigeringen (HeroBar)
  // har egna knappar med samma korta namn ("Kalender"/"Inköp"/"Todos"), en
  // krock annars för både skärmläsare och tester.
  const allTabs: { key: HomeTab; label: string; icon: LucideIcon; enabled: boolean }[] = [
    // Medlemmar flyttad överst (2026-08-12, Zaidas önskemål: "sätt
    // medlemsikonen bredvid ensam gubbe ikonen (personliga)") — ligger nu
    // direkt intill onShowAppNav-knappen (User-ikonen) i DOM-ordningen
    // istället för sist, före Inställningar. Ersätter sedan tidigare samma
    // dag de två separata ikon+popup-mönstren (familjeväljaren och "Visa
    // medlemmar") med EN riktig flik: familjeval + medlemslista, ingen
    // popup. Se renderingen av effectiveTab === "members" nedan.
    { key: "members", label: "Visa medlemmar", icon: Users, enabled: canSeeMembers },
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
    <div
      className={styles.home}
      // --modal-bottom-reserve (2026-08-09, Zaidas fynd: "när jag är inne på
      // min egen todo och familjebaren inte finns så skall modalen fylla
      // skärmen hela vägen ner till första navbaren") — uppgiftsmodalerna
      // (TodoDetailModal.css/TodoCreatorModal.css/ParentTodoThreadView.css:s
      // reuse-overlay) reserverade tidigare ALLTID 124px under sig på mobil
      // (HeroBar 64px + Hem-vyns egen .controlRow ~60px, staplade), oavsett
      // om .controlRow faktiskt fanns i vyn eller inte — samma delade
      // CSS-klasser används av modaler öppnade från BÅDE Hem (där raden
      // finns) och den personliga Todos-panelen/Inställningar (där den
      // aldrig gör det), och en ren CSS-media-query kan inte se om en
      // fixed-positionerad rad råkar finnas i DOM:en. Löst genom att bara
      // Hem-vyn (och bara när dess egen controlRow faktiskt RENDERAS, se
      // enableTabs nedan) sätter en CSS-variabel på sin rot — modalerna är
      // vanliga (icke-porterade) DOM-barn till den här komponenten när de
      // öppnas härifrån, så variabeln ärvs ner till dem via vanlig CSS-
      // cascade. Ingen variabel satt (TodosView.tsx/Inställningar m.fl.) ger
      // CSS:ns egna, mindre default (4rem) — HeroBar ensam.
      // rem, inte px (2026-08-11, Zaidas fynd: "familjens navbar döljs nu
      // av den första navbaren på surfplattan") — HeroBars bottennav
      // VÄXER förbi 16px-antagandet på en bred mobil-brytpunkts-skärm
      // (surfplatta i portrait, root-typsnittet skalar via
      // clamp(15px,13px+0.6vw,22px), se Shell.tsx), samma calc() håller
      // reserven i synk. Bara 4rem nu (2026-08-12, inte längre "HeroBar +
      // controlRow staplade") — de två navbarerna delar samma fysiska plats
      // istället för att ligga ovanpå varandra, se Shell.tsx:s
      // hideHeroBarOnMobile.
      style={enableTabs ? ({ "--modal-bottom-reserve": "4rem" } as React.CSSProperties) : undefined}
    >
      {enableTabs && (
        // Två navbarer, en i taget (2026-08-12) — homeShowFamilyNav styr
        // bara MOBIL synlighet (CSS-klass nedan, .controlRow.appNavShowing),
        // aldrig avmontering: på desktop (≥1024px) finns ingen
        // platskonflikt med HeroBars sidopanel, controlRow ska alltid synas
        // där oavsett växlingsläge (se MemberOverview.module.css).
        <div className={`${styles.controlRow}${!homeShowFamilyNav ? ` ${styles.appNavShowing}` : ""}`}>
          {onShowAppNav && (
            <button
              aria-label="Visa appens navigering"
              className={`${styles.tabButton} ${styles.mobileOnlyIcon}`}
              onClick={onShowAppNav}
              title="Visa appens navigering"
              type="button"
            >
              <User size="1.125rem" />
            </button>
          )}
          <div aria-label="Hem-vyns sektioner" className={styles.tabRow} role="tablist">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                aria-controls={`home-panel-${key}`}
                aria-label={label}
                aria-selected={activeTab === key}
                className={`${styles.tabButton} ${activeTab === key ? styles.tabButtonActive : ""}`}
                id={`home-tab-${key}`}
                key={key}
                onClick={() => handleTabClick(key)}
                role="tab"
                title={label}
                type="button"
              >
                <Icon size="1.125rem" />
              </button>
            ))}
          </div>
          {onNavigate && (
            <button
              aria-label="Inställningar"
              className={`${styles.tabButton} ${styles.mobileOnlyIcon}`}
              onClick={() => onNavigate("settings")}
              title="Inställningar"
              type="button"
            >
              <Settings size="1.125rem" />
            </button>
          )}
        </div>
      )}

      {effectiveTab === "calendar" && canSeeCalendar && (
        <div aria-labelledby="home-tab-calendar" className={styles.calendarWrap} id="home-panel-calendar" key={`calendar-${tabResetKey}`} role="tabpanel" tabIndex={0}>
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
        <article aria-labelledby="home-tab-todos" className="dashboard" id="home-panel-todos" key={`todos-${tabResetKey}`} role="tabpanel" tabIndex={0}>
          {/* "+" (ny familjekategori) + import/export (2026-08-03, sökruta/
              titel/väntar-antal/Öppna-knapp borttagna 2026-08-04, Zaidas
              önskemål: "lägg ikonerna... och knapparna... bredvid varandra.
              Ta bort filtreringen och öppnasektionen") — bara för mitt EGET
              konto, aldrig en annan familj jag bara tittar på via filtret
              ovan. */}
          {isOwnFamilySelected && onCreateCategory && (
            // Ikonstorleken minimerad (2026-08-09, Zaidas önskemål: "Gör todo
            // listan så att den upptar mest plats... minimera resten av
            // texten... infoknapparna") — samma .icon-button-klickyta (44px,
            // oförändrad touch-mål-golv), bara den synliga glyfen krymper
            // (var 18px), matchar samma minskning i TodoThreadToolbar.tsx.
            <div className={styles.homeQuickAdd}>
              <button
                aria-label="Ny familjekategori"
                className="icon-button"
                onClick={() => {
                  setAddingFamilyCategory((v) => !v);
                  setNewFamilyCategoryName("");
                  setNoFamilyCategory(false);
                }}
                title="Ny familjekategori"
                type="button"
              >
                <Plus size={14} />
              </button>
              <button
                aria-expanded={showFamilyImportExport}
                aria-label="Importera/exportera familjens uppgifter"
                className="icon-button"
                onClick={() => setShowFamilyImportExport((v) => !v)}
                title="Importera/exportera"
                type="button"
              >
                <Upload size={14} />
              </button>
            </div>
          )}

          {addingFamilyCategory && onCreateCategory && onCreateTodo && (
            <form
              className={styles.homeQuickAdd}
              onSubmit={async (e) => {
                e.preventDefault();
                const taskTitle = newFamilyCategoryTaskTitle.trim();
                const categoryName = newFamilyCategoryName.trim();
                if (!taskTitle || (!noFamilyCategory && !categoryName)) return;
                const categoryId = noFamilyCategory ? null : (await onCreateCategory(categoryName, true)).id;
                onCreateTodo({
                  id: `todo-${generateId()}`,
                  title: taskTitle,
                  createdBy: currentMember.id,
                  assignedTo: null,
                  status: "pending",
                  starValue: 0,
                  visual: { type: "lucide-icon", value: "⭐" },
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
                  personalCategoryId: categoryId,
                  notes: null
                });
                setNewFamilyCategoryName("");
                setNewFamilyCategoryTaskTitle("");
                setNoFamilyCategory(false);
                setAddingFamilyCategory(false);
              }}
            >
              <label className={styles.homeQuickAddNoCategory}>
                <input
                  checked={noFamilyCategory}
                  onChange={(e) => setNoFamilyCategory(e.target.checked)}
                  type="checkbox"
                />
                Ingen kategori
              </label>
              {!noFamilyCategory && (
                <input
                  aria-label="Namn på ny familjekategori"
                  autoFocus
                  className="text-input"
                  onChange={(e) => setNewFamilyCategoryName(e.target.value)}
                  placeholder="Namn på kategorin…"
                  value={newFamilyCategoryName}
                />
              )}
              <input
                aria-label={noFamilyCategory ? "Namn på uppgiften" : "Namn på första uppgiften"}
                autoFocus={noFamilyCategory}
                className="text-input"
                onChange={(e) => setNewFamilyCategoryTaskTitle(e.target.value)}
                placeholder={noFamilyCategory ? "Namn på uppgiften…" : "Namn på första uppgiften…"}
                value={newFamilyCategoryTaskTitle}
              />
              <button
                aria-label={noFamilyCategory ? "Skapa uppgift" : "Skapa familjekategori och uppgift"}
                className="icon-button"
                disabled={!newFamilyCategoryTaskTitle.trim() || (!noFamilyCategory && !newFamilyCategoryName.trim())}
                type="submit"
              >
                <Plus size={18} />
              </button>
            </form>
          )}

          {isOwnFamilySelected && showFamilyImportExport && onCreateTodo && onUpdateTodo && onDeleteTodo && onCreateCategory && (
            <TodoImportExport
              allTodosForMatching={allTodos}
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
              onReorderThreads={onReorderFamilyThreads}
              range={todoThreadRange}
              sources={filteredThreadSources}
              threadOrder={familyThreadOrder}
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

          {/* Delade EGNA kategorier (2026-08-06, Zaidas önskemål: "det skall
              vara möjligt att dela sina egna kategorier med utvalda
              familjer") — en kategori en ANNAN familj delat med mig via
              kategorimenyns "Dela", oavsett vald familj i filtret ovan
              (samma "en delning är inte knuten till ett specifikt
              familjekonto-val"-princip som Delade barn ovan). */}
          <SharedCategoryThreads range={todoThreadRange} todoBubbleSize={todoBubbleSize} todoThreadGap={todoThreadGap} />

          {/* Flyttad hit, sist i sektionen (2026-08-15, Zaida: "sektionen
              skall flyttas under todo-sektionen, bollarna och korten") —
              var tidigare först i panelen. Ingen egen fyllnadsmekanik
              längre (samma dags uppföljning: "ta bort mellanrummet uppåt
              och nedåt till navbaren. Allt skall vara synligt på skärmen
              utan att skrolla") — hugger nu bara till sin egna naturliga
              höjd, se FamilyCompletedTimeline.css och den
              #home-panel-todos-scopade min-height-fixen i
              ParentTodoThreadView.css. */}
          <FamilyCompletedTimeline members={members} todos={allTodos} />
        </article>
      )}

      {effectiveTab === "shopping" && canSeeShopping && (
        <article aria-labelledby="home-tab-shopping" className="dashboard" id="home-panel-shopping" key={`shopping-${tabResetKey}`} role="tabpanel" tabIndex={0}>
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
                // Redigerbara varor (2026-08-16, Zaidas fynd: "Listor måste
                // gå att redigera i familjens listvy") — samma gräns som
                // "ny lista"-formuläret ovan: mitt eget konto eller Mina
                // familjekonton (genuint medlemskap), aldrig en
                // Familjeanslutning (bara läsbar sammanfattning där).
                const listAccountId = l.accountId ?? ownAccountId;
                const editable =
                  Boolean(onToggleHomeShoppingItem) && (shoppingCreatableFamilyAccountIds?.has(listAccountId) ?? false);
                const draft = homeShoppingDraftItems[l.id] ?? "";

                function submitAdd() {
                  const trimmed = draft.trim();
                  if (!trimmed) return;
                  onAddHomeShoppingItem?.(l, trimmed);
                  setHomeShoppingDraftItems((prev) => ({ ...prev, [l.id]: "" }));
                }

                function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
                  const items = splitPastedShoppingItems(e.clipboardData.getData("text"));
                  if (items.length <= 1) return;
                  e.preventDefault();
                  items.forEach((title) => onAddHomeShoppingItem?.(l, title));
                }

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
                      <ul className={shoppingStyles.items}>
                        {activeItems.map((item) => (
                          <li className={shoppingStyles.itemRow} key={item.id}>
                            <span className={`${shoppingStyles.itemLabel}${item.done ? ` ${shoppingStyles.done}` : ""}`}>
                              <input
                                aria-label={item.title}
                                checked={item.done}
                                disabled={!editable}
                                onChange={() => onToggleHomeShoppingItem?.(l, item.id)}
                                type="checkbox"
                              />
                              <span>{item.title}</span>
                            </span>
                            {editable && (
                              <button
                                aria-label={`Ta bort ${item.title}`}
                                className="icon-button danger"
                                onClick={() => onDeleteHomeShoppingItem?.(l, item.id)}
                                type="button"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {editable && (
                      <div className={shoppingStyles.addRow}>
                        <input
                          className="text-input"
                          onChange={(e) => setHomeShoppingDraftItems((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }}
                          onPaste={handlePaste}
                          placeholder="Lägg till vara"
                          value={draft}
                        />
                        <button aria-label="Lägg till vara" className="icon-button" onClick={submitAdd} type="button">
                          <Plus size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* En annan familjs delade lista (ADR-0026, externalSharedWith) —
              flyttad hit från Inköp-panelen (2026-08-01, Zaidas rättelse: "de
              skall endast synas i hemvyn"), oförändrad komponent/logik.
              selectedFamilyId (2026-08-16, Zaidas fynd: "där ska inga andra
              familjers listor synas om t.ex. det är 'wiss Kolmodin' som är
              vald att visas") — visades tidigare ALLTID oavsett filtret. */}
          <SharedShoppingLists currentMember={currentMember} selectedFamilyId={selectedFamilyId} />
        </article>
      )}

      {effectiveTab === "mealplan" && (
        isOwnFamilySelected ? (
          <article aria-labelledby="home-tab-mealplan" className="dashboard" id="home-panel-mealplan" key={`mealplan-${tabResetKey}`} role="tabpanel" tabIndex={0}>
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
          <article aria-labelledby="home-tab-mealplan" className="dashboard" id="home-panel-mealplan" key={`mealplan-${tabResetKey}`} role="tabpanel" tabIndex={0}>
            <header className="section-header">
              <div><p className="eyebrow">Måltidsplanering</p><h2>Den här veckan</h2></div>
            </header>
            <WeeklyMealPlan
              recipes={crossAccountRecipeGroups.find((g) => g.accountId === selectedFamilyId)?.recipes ?? []}
              targetAccountId={selectedFamilyId}
            />
          </article>
        ) : (
          <article aria-labelledby="home-tab-mealplan" className="dashboard" id="home-panel-mealplan" key={`mealplan-${tabResetKey}`} role="tabpanel" tabIndex={0}>
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

      {/* Medlemmar-fliken (2026-08-12, Zaidas beslut: "Under medlemmar
          skall man kunna styra vilka familjer som skall visas och se
          medlemmarna i dessa, samt trycka på dem för att komma till
          dashboarden. så ta bort drop down och gå tillbaka till en sida man
          kommer till") — ersätter de tidigare två separata ikon+popup-
          mönstren (familjeväljaren och "Visa medlemmar") med en riktig
          sida: familjeval (om fler än en familj bidrar) + medlemslista.
          Radstilen (.memberPopupRow/.familyPopupRow) återanvänds oförändrad
          från de gamla popuperna — bara containern är ny (.membersTabList,
          ingen popup-storleksbegränsning). */}
      {effectiveTab === "members" && canSeeMembers && (
        <article aria-labelledby="home-tab-members" className="dashboard" id="home-panel-members" key={`members-${tabResetKey}`} role="tabpanel" tabIndex={0}>
          {showFamilyFilter && (
            <>
              <header className="section-header">
                <div><p className="eyebrow">Familj</p><h2>Välj familj</h2></div>
              </header>
              <div aria-label="Familjeval" className={styles.membersTabList} role="group">
                <button
                  className={`${styles.memberPopupRow} ${styles.familyPopupRow}`}
                  onClick={() => setSelectedFamilyId("all")}
                  type="button"
                >
                  <span>Alla familjer</span>
                  {selectedFamilyId === "all" && <Check aria-hidden="true" size="1rem" />}
                </button>
                {familyOptions.map((f) => (
                  <button
                    className={`${styles.memberPopupRow} ${styles.familyPopupRow}`}
                    key={f.accountId}
                    onClick={() => setSelectedFamilyId(f.accountId)}
                    type="button"
                  >
                    <span>{f.accountName}</span>
                    {selectedFamilyId === f.accountId && <Check aria-hidden="true" size="1rem" />}
                  </button>
                ))}
              </div>
            </>
          )}
          <header className="section-header">
            <div><p className="eyebrow">Familj</p><h2>Medlemmar</h2></div>
          </header>
          {sortedMembers.length === 0 ? (
            <p className="empty-note">Inga medlemmar att visa.</p>
          ) : (
            // Små kort istället för fullbredds-rader (2026-08-12, Zaidas
            // önskemål: "Låt medlemmarna få små cards som är lättare att
            // klicka rätt i") — grid av kvadratiska klickytor (avatar+namn
            // staplat) ger en mycket större, mer förlåtande träffyta per
            // medlem än en tunn rad, särskilt på mobil. Vuxna/föräldrar
            // överst, barn underst (sortedMembers, se ovan).
            <div aria-label="Medlemslista" className={styles.memberCardList} role="group">
              {sortedMembers.map((m) =>
                m.isOwn ? (
                  <button
                    className={styles.memberCard}
                    key={m.id}
                    onClick={() => onSelectMember(m.id)}
                    type="button"
                  >
                    <MemberAvatar member={m} size="small" />
                    <span className={styles.memberCardName}>{m.name}</span>
                  </button>
                ) : (
                  <div className={`${styles.memberCard} ${styles["memberCard--static"]}`} key={`${m.accountId}-${m.id}`}>
                    <MemberAvatar member={m} size="small" />
                    <span className={styles.memberCardName}>
                      {m.name}
                      {selectedFamilyId === "all" && (
                        <small>{familyNameById.get(m.accountId) ?? "Okänd familj"}</small>
                      )}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </article>
      )}
    </div>
  );
}
