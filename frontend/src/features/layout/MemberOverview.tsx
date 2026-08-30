import { useMemo, useState } from "react";
import type { ClipboardEvent } from "react";
import { CalendarDays, CheckSquare, Plus, Settings, ShoppingCart, Trash2, Upload, User, UtensilsCrossed } from "lucide-react";
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
import { FamilyWeekRoutines } from "../todos/FamilyWeekRoutines";
import { FamilyChildrenStars } from "./FamilyChildrenStars";
import { generateId } from "../../utils/uuid";
import { useHomeTabNavSync } from "./useHomeTabNavSync";
import type { HomeTab } from "./useHomeTabNavSync";
import type { ImportResult, ImportUndo } from "../todos/useTodosState";
import type { CrossAccountRecipes } from "../../api/recipes";
import type {
  AppPanel, Calendar, CalendarEvent, CalendarSettings, Id, Member, MembershipMemberSummary, Recipe, Role, ShoppingList,
  Todo, TodoCategory, TodoThreadRange
} from "@shared/types";
import styles from "./MemberOverview.module.css";
import shoppingStyles from "../shopping/ShoppingLists.module.css";

// Hem-vyns familjevy (2026-08-30, Zaidas önskemål: "jag ska kunna vara
// ansluten till flera familjer, men själv aktivera och avaktivera och på så
// sätt bestämma hur mycket jag vill se") — den tidigare "Välj familj"-
// popupen (filtrera till EN familj i taget) är borttagen och flyttad till
// Inställningar → Familj → Familjevy, som en persistent av/på-knapp per
// familj (se hiddenCrossAccountIds/hiddenConnectionAccountIds i
// shared/types.ts). Hem-vyn visar därför alltid ALLA icke-avaktiverade
// familjer kombinerat (motsvarar den gamla "Alla familjer"-vyn) — calendars/
// extraMembers/familyThreadSources är redan förfiltrerade av backend (döljer
// avaktiverade konton helt, förutom personligt tilldelade todos som istället
// dyker upp i mina egna todos, se MemberShellContent.tsx). En medlem från en
// annan familj (cross-account/Familjeanslutning) kommer bara som en
// MembershipMemberSummary, aldrig en fullständig Member, taggad med
// källfamiljens accountId.
type ExtraMember = MembershipMemberSummary & { accountId: Id };
type FamilyOption = { accountId: Id; accountName: string };

// Fyra flikval bredvid familjeväljaren (2026-07-31, Zaidas önskemål:
// "bredvid den väljaren på samma rad skall ikoner visas så att man kan
// trycka på dessa och se familjens kalender, inköpslista, todos samt en
// måltidsplanering") — ersätter det tidigare "visa allt staplat"-läget:
// bara EN sektion visas åt gången. Medlemmar-kortet (inte en av de fyra
// ikonerna Zaida räknade upp) förblir alltid synligt ovanför, oberoende av
// vald flik. Typen lever i useHomeTabNavSync.ts (som synkar valet mot
// webbläsarens URL/historik), importerad här som HomeTab nedan.

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
  // för MITT EGET konto, oberoende av vilka andra familjer som också visas
  // kombinerat i Hem-vyn.
  members?: Member[];
  // Bara viewerns EGNA kategorier (2026-08-30) — läses av FamilyWeekRoutines.tsx
  // för att filtrera bort kategorier med excludeFromWeekOverview=true (togglas
  // i Inställningar → Familj → Dashboard, inte här).
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
  // Vilken av mina RIKTIGA medlemskap (mitt eget konto eller Mina
  // familjekonton) jag just nu agerar i — bara relevant för handlingar som
  // kräver EN specifik målfamilj (skapa en inköpslista i, visa
  // måltidsplanering för), till skillnad från den gamla globala
  // "selectedFamilyId" som filtrerade HELA Hem-vyn till en familj i taget
  // (borttagen 2026-08-30, se familjevy-kommentaren högst upp i filen).
  // Två separata state-variabler (inte en delad) så ett val i Inköp-fliken
  // inte oväntat följer med till Måltidsplanering-fliken. Bara en dropdown i
  // taget behövs (inte en väljar-popup) eftersom antalet riktiga medlemskap
  // (identityAccountIds) normalt är litet.
  const [shoppingTargetFamilyId, setShoppingTargetFamilyId] = useState<Id>(ownAccountId);
  const [mealplanFamilyId, setMealplanFamilyId] = useState<Id>(ownAccountId);
  const { activeTab, selectTab } = useHomeTabNavSync();
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
    selectTab(tab);
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

  // familyOptions (mitt eget konto + Mina familjekonton + Familjeanslutningar)
  // används fortfarande för att slå upp visningsnamn på "vilken familj äger
  // det här"-etiketter nedan — bara VILKA familjer som bidrar styrs numera
  // helt server-side (hidden*AccountIds), ingen egen väljar-UI kvar här.
  const familyNameById = useMemo(
    () => new Map(familyOptions.map((f) => [f.accountId, f.accountName])),
    [familyOptions]
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
  const activeLists = shoppingLists.filter((l) => l.deletedAt === null);
  const activeFamilyMembers = activeMembers.filter((m) => m.deletedAt === null);

  // Alltid kombinerat, alla icke-avaktiverade familjer (motsvarar den gamla
  // "Alla familjer"-vyn, se familjevy-kommentaren högst upp i filen).
  const filteredMembers = useMemo(() => {
    const own = activeFamilyMembers.map((m) => ({ ...m, accountId: ownAccountId, isOwn: true as const }));
    const extra = extraMembers.map((m) => ({ ...m, isOwn: false as const }));
    return [...own, ...extra];
  }, [activeFamilyMembers, extraMembers, ownAccountId]);

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
  // Medlemmar/familjeväljaren har INGEN egen ikon längre (2026-08-29, Zaidas
  // beslut efter en mockup-bild: "det blir som att medlemmarna finns där och
  // behöver då inte en egen ikon i navbaren") — de flyttade in i en ny
  // "overview"-flik (familjens medlemmar + veckans rutiner + barnens
  // stjärnor) som man bara når genom att trycka på Hem (huset), inte via en
  // klickbar ikon här. Se DEFAULT_TAB i useHomeTabNavSync.ts och
  // renderingen av effectiveTab === "overview" nedan.
  const allTabs: { key: HomeTab; label: string; icon: LucideIcon; enabled: boolean }[] = [
    { key: "calendar", label: "Visa kalender", icon: CalendarDays, enabled: canSeeCalendar },
    { key: "shopping", label: "Visa inköpslista", icon: ShoppingCart, enabled: canSeeShopping },
    { key: "todos", label: "Visa todos", icon: CheckSquare, enabled: canSeeTodos },
    { key: "mealplan", label: "Visa måltidsplanering", icon: UtensilsCrossed, enabled: true }
  ];
  const tabs = allTabs.filter((t) => t.enabled);
  // "vald vuxen"-vyn (enableTabs=false) visar alltid bara kalendern, oavsett
  // vilken flik som råkar ligga i state sedan tidigare (samma instans kan
  // återanvändas, se `key`-propen i MemberShellContent.tsx). En roll utan
  // canSeeMembers faller tillbaka på kalendern istället för den nya
  // overview-fliken (som visar just medlemmarna denna roll inte får se).
  const effectiveTab = !enableTabs ? "calendar" : activeTab === "overview" && !canSeeMembers ? "calendar" : activeTab;

  return (
    <div
      className={`${styles.home}${enableTabs && !homeShowFamilyNav ? ` ${styles.appNavShowing}` : ""}`}
      // --modal-bottom-reserve (2026-08-09, Zaidas fynd: "när jag är inne på
      // min egen todo och familjebaren inte finns så skall modalen fylla
      // skärmen hela vägen ner till första navbaren") — uppgiftsmodalerna
      // (TodoDetailModal.css/TodoCreatorModal.css/ParentTodoThreadView.css:s
      // reuse-overlay) reserverar plats under sig för en fast BOTTENnav, om
      // en sådan faktiskt finns. Ingen variabel satt (TodosView.tsx/
      // Inställningar m.fl.) ger CSS:ns egna, mindre default (4rem) —
      // HeroBar ensam.
      // Familjenavbaren (.controlRow) flyttades till TOPPEN 2026-08-30
      // (Zaida: "familjenavbaren bör hoppa högst upp på skärmen") — den
      // upptar därför inte längre någon plats i BOTTEN alls. Reserven
      // beror nu på vilken av de två navbarerna som faktiskt visas
      // (homeShowFamilyNav, se Shell.tsx:s hideHeroBarOnMobile): "0px" när
      // controlRow (topp) visas — ingen bottennav finns då på Hem-panelen
      // — annars "4rem" när HeroBar (botten, oförändrad) tar över.
      // rem, inte px (2026-08-11, Zaidas fynd: "familjens navbar döljs nu
      // av den första navbaren på surfplattan") — HeroBars bottennav
      // VÄXER förbi 16px-antagandet på en bred mobil-brytpunkts-skärm
      // (surfplatta i portrait, root-typsnittet skalar via
      // clamp(15px,13px+0.6vw,22px), se Shell.tsx), samma calc() håller
      // reserven i synk.
      style={
        enableTabs
          ? ({ "--modal-bottom-reserve": homeShowFamilyNav ? "0px" : "4rem" } as React.CSSProperties)
          : undefined
      }
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
            calendars={calendars}
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
              konto, oberoende av vilka andra familjer som visas kombinerat. */}
          {onCreateCategory && (
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

          {showFamilyImportExport && onCreateTodo && onUpdateTodo && onDeleteTodo && onCreateCategory && (
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

          {familyThreadSources.length === 0 ? (
            <p className="empty-note">Inget väntar just nu.</p>
          ) : (
            <FamilyTodoThreads
              onReorderBubbles={onReorderBubbles}
              onReorderThreads={onReorderFamilyThreads}
              range={todoThreadRange}
              sources={familyThreadSources}
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

          {/* Ny lista, i valfri familj jag är en riktig medlem av (2026-08-01,
              utökad 2026-08-30 med en egen liten familjeväljare — ersätter
              den gamla globala Hem-filtret, se familjevy-kommentaren högst
              upp i filen) — ENDAST mitt eget konto eller Mina familjekonton,
              aldrig en Familjeanslutning. */}
          {onCreateFamilyShoppingList && shoppingCreatableFamilyAccountIds?.has(shoppingTargetFamilyId) && (
            <form
              className={styles.homeQuickAdd}
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newListName.trim();
                if (!trimmed) return;
                onCreateFamilyShoppingList(shoppingTargetFamilyId, trimmed);
                setNewListName("");
              }}
            >
              {shoppingCreatableFamilyAccountIds.size > 1 && (
                <select
                  aria-label="Vilken familj ska listan tillhöra?"
                  className="text-input"
                  onChange={(e) => setShoppingTargetFamilyId(e.target.value)}
                  value={shoppingTargetFamilyId}
                >
                  {[...shoppingCreatableFamilyAccountIds].map((accountId) => (
                    <option key={accountId} value={accountId}>
                      {accountId === ownAccountId ? "Min familj" : (familyNameById.get(accountId) ?? "Okänd familj")}
                    </option>
                  ))}
                </select>
              )}
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
                  <div aria-label={l.name} className={styles.shoppingList} key={l.id} role="group">
                    <header>
                      <strong>{l.name}</strong>
                      <span>
                        {remaining} kvar
                        {l.accountId && l.accountId !== ownAccountId && (
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
              "all" = ingen filtrering (2026-08-30, den gamla globala
              familjeväljaren som en gång motiverade filtret här är borttagen
              — Hem-vyn visar numera alltid alla icke-avaktiverade familjer
              kombinerat, se familjevy-kommentaren högst upp i filen). */}
          <SharedShoppingLists currentMember={currentMember} selectedFamilyId="all" />
        </article>
      )}

      {effectiveTab === "mealplan" && (
        <article aria-labelledby="home-tab-mealplan" className="dashboard" id="home-panel-mealplan" key={`mealplan-${tabResetKey}`} role="tabpanel" tabIndex={0}>
          <header className="section-header">
            <div><p className="eyebrow">Måltidsplanering</p><h2>Den här veckan</h2></div>
          </header>
          {/* Egen liten familjeväljare (2026-08-30, ersätter den gamla
              globala Hem-filtret, se familjevy-kommentaren högst upp i
              filen) — bara mitt eget konto eller Mina familjekonton (ett
              genuint medlemskap), aldrig en Familjeanslutning (Zaidas
              rättelse 2026-08-01: "man måste först göra en familj med dessa
              familjer som medlemmar"). Dropdownen erbjuder bara riktiga
              medlemskap (identityAccountIds), så mealplanFamilyId pekar
              alltid på en giltig målfamilj — inget "inte tillgängligt"-läge
              behövs längre. */}
          {identityAccountIds.size > 1 && (
            <select
              aria-label="Vilken familjs måltidsplanering?"
              className="text-input"
              onChange={(e) => setMealplanFamilyId(e.target.value)}
              value={mealplanFamilyId}
            >
              {[...identityAccountIds].map((accountId) => (
                <option key={accountId} value={accountId}>
                  {accountId === ownAccountId ? "Min familj" : (familyNameById.get(accountId) ?? "Okänd familj")}
                </option>
              ))}
            </select>
          )}
          {mealplanFamilyId === ownAccountId ? (
            <>
              <WeeklyMealPlan recipes={recipes} />
              {/* En ansluten familjs receptbok (ADR-0030, dataScope.recipes) —
                  flyttad hit från Recept-panelen (2026-08-01, Zaidas rättelse:
                  "de skall endast synas i hemvyn"), oförändrad komponent/logik. */}
              <ConnectionRecipesSection />
            </>
          ) : (
            <WeeklyMealPlan
              recipes={crossAccountRecipeGroups.find((g) => g.accountId === mealplanFamilyId)?.recipes ?? []}
              targetAccountId={mealplanFamilyId}
            />
          )}
        </article>
      )}

      {/* Hem-vyns nya standardvy, "familjeläge" (2026-08-29, Zaidas
          önskemål efter en mockup-bild) — ersätter den tidigare fristående
          Medlemmar-fliken/-ikonen (2026-08-12) som Hem-panelens standardvy:
          medlemslista (.memberCardList) + två nya sektioner därunder,
          veckans rutiner och barnens stjärnor. Nås bara genom att trycka på
          Hem (huset) — ingen egen klickbar ikon i navbaren längre, se
          allTabs ovan och DEFAULT_TAB i useHomeTabNavSync.ts.
          "Välj familj"-popupen som tidigare låg här (filtrera Hem-vyn till
          EN familj i taget) är borttagen 2026-08-30 och flyttad till
          Inställningar → Familj → Familjevy, som en persistent av/på-knapp
          per familj — se familjevy-kommentaren högst upp i filen. */}
      {effectiveTab === "overview" && canSeeMembers && (
        // Ingen role="tabpanel"/aria-labelledby mot en tab (till skillnad
        // från övriga sektioner nedan) — "overview" är medvetet INTE en del
        // av tablistan (se kommentaren ovan), ett sådant attribut hade
        // pekat mot ett icke-existerande element.
        <article aria-label="Familj" className="dashboard" id="home-panel-overview" key={`overview-${tabResetKey}`}>
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
                    <span className={styles.memberCardName}>
                      {m.name}
                      {/* Rollnamn (2026-08-29, mockup-referens) — egna
                          medlemmar har en riktig, ev. anpassad rollnamn
                          (roleId slår upp mot roles), en anslutens
                          medlemssammanfattning saknar roleId helt, se
                          else-grenen nedan. */}
                      <small>{roles.find((r) => r.id === m.roleId)?.name ?? (m.isChild ? "Barn" : "Vuxen")}</small>
                    </span>
                  </button>
                ) : (
                  <div className={`${styles.memberCard} ${styles["memberCard--static"]}`} key={`${m.accountId}-${m.id}`}>
                    <MemberAvatar member={m} size="small" />
                    <span className={styles.memberCardName}>
                      {m.name}
                      <small>{m.isChild ? "Barn" : "Vuxen"}</small>
                      <small>{familyNameById.get(m.accountId) ?? "Okänd familj"}</small>
                    </span>
                  </div>
                )
              )}
            </div>
          )}

          {/* Veckans rutiner + barnens stjärnor (2026-08-29) — kräver
              allTodos/activeFamilyMembers, som alltid är MITT EGET kontos
              data, oberoende av vilka andra familjer som också visas
              kombinerat i Hem-vyn. */}
          <header className="section-header">
            <div><p className="eyebrow">Familj</p><h2>Veckans rutiner</h2></div>
          </header>
          <FamilyWeekRoutines
            calendars={calendars}
            categories={categories}
            members={activeFamilyMembers}
            todos={allTodos}
          />

          <header className="section-header">
            <div><p className="eyebrow">Familj</p><h2>Barnens stjärnor</h2></div>
          </header>
          <FamilyChildrenStars members={activeFamilyMembers} roles={roles} />
        </article>
      )}
    </div>
  );
}
