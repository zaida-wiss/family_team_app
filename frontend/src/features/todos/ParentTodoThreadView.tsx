import "./ParentTodoThreadView.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Id, Member, Role, Todo, TodoCategory, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask, TodoThreadRange } from "@shared/types";
import { TodoDetailView } from "./TodoDetailView";
import { TodoEditModal } from "./TodoEditModal";
import { TodoCategoryShareModal } from "./TodoCategoryShareModal";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { useNowTick } from "../../hooks/useNowTick";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";
import { downloadCsv, todosToCsv } from "./todoCsv";
import { isRecurringTemplate } from "./recurringTodos";
import { isChildMember, isDueWithinRange, isTodoVisibleNow } from "./selectors";
import { clearTodoTimer, readTodoTimerElapsedMs, readTodoTimerIsActive, startTodoTimer, timerCapMinutes, toggleTodoTimerPause } from "./useTodoTimer";
import { formatDuration } from "../../utils/durationFormat";

const HOLD_DURATION_MS = 2000;
// Måste matcha CSS-animationens längd (todo-thread-dissolve i .css) — bollen
// hålls kvar i DOM:en så länge, tonad med --dissolving-klassen, innan den
// faktiskt tas bort ur listan.
const DISSOLVE_DURATION_MS = 500;
const CHILDREN_THREAD_ID = "__children__";
// "Mina uppgifter" (2026-08-06, Zaidas önskemål — "vad händer med uppgifter
// som saknar kategori?") behöver INGEN egen virtuell tråd här — den är en
// RIKTIG, auto-skapad TodoCategory (samma mekanism som familjevyns
// samlingskategori, se getOrCreateUncategorizedCollector i
// todoCategoriesService.ts) och renderas redan via den vanliga
// categoryThreads-mappningen nedan, precis som vilken annan kategori.

// Exporterad (2026-08-01) för återanvändning i FamilyTodoThreads.tsx — Hem-
// vyns familjebubblor ska ha "samma gester och kategorimenyer som todovyn"
// (Zaidas önskemål), samma tidsformattering för den delade in-progress-klockan.
// Re-exporterad från den delade utils/durationFormat.ts (2026-08-10, tidigare
// en egen, näst intill identisk lokal kopia — konsoliderad på Zaidas förslag
// "en hook vore kanske bra för timern?") — alla befintliga importer av
// formatElapsed härifrån (bl.a. FamilyTodoThreads.tsx) fungerar oförändrat.
export const formatElapsed = formatDuration;

// Timern längst ner i en bubbla (2026-08-09, Zaidas önskemål: "när en timer
// är igång på en uppgiftsbubbla så vill jag även kunna se timern längst ner
// i bubblan") — läser samma localStorage-nyckel som TodoTimerSection
// (TodoDetailView.tsx) via readTodoTimerStartedAt, en icke-reaktiv
// funktion; komponenten renderas om varje sekund via den delade nowTick-
// klockan (useNowTick) som redan tickar för "någon håller på med den
// här"-klockan, så ingen egen timer/effekt behövs bara för detta. Delad
// mellan ParentTodoThreadView.tsx och FamilyTodoThreads.tsx (samma
// bubbel-markup, samma --home-modifier-mönster som formatElapsed ovan).
// "now"-parametern (2026-08-09, borttagen) behövs inte längre för själva
// uträkningen — readTodoTimerElapsedMs läser Date.now() internt — men
// FUNKTIONEN anropas fortfarande på nytt varje sekund via den delade
// nowTick-klockan i anroparna, vilket är det som faktiskt triggar
// omrendering med ett färskt resultat.
export function bubbleTimerLabel(todo: Todo): string | null {
  if (!todo.timerEnabled) return null;
  // Räknar redan in ackumulerad tid från ev. tidigare pausade perioder — en
  // PAUSAD timer ska fortsatt visa sin frusna tid här, inte försvinna
  // (skiljer sig från den gamla readTodoTimerStartedAt, som bara kände till
  // "körs den just nu").
  const elapsedMs = readTodoTimerElapsedMs(todo.id, timerCapMinutes(todo));
  if (elapsedMs === null) return null;
  if (todo.plannedDurationMinutes) {
    const totalMs = todo.plannedDurationMinutes * 60_000;
    const remainingMs = Math.max(0, totalMs - elapsedMs);
    return formatElapsed(remainingMs);
  }
  return formatElapsed(elapsedMs);
}

type Props = {
  todos: Todo[];
  // Ofiltrerad lista (2026-07-08) — den vanliga todos-propen ovan är redan
  // filtrerad (bara pending, inom valt tidsspann, mallar bortfiltrerade), så
  // en återkommande MALL finns inte kvar i den. TodoEditModal behöver ändå
  // kunna slå upp mallen bakom en occurrence (full fältparitet med
  // skapa-modalen, se TodoEditModal.tsx:s seriesSource).
  allTodos: Todo[];
  members: Member[];
  roles: Role[];
  currentMember: Member;
  categories: TodoCategory[];
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onToggleTodoInProgress: (todoId: Id, targetMemberId: Id) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: Id) => void;
  // elapsedMs (2026-08-07) — timerfunktionen tillgänglig för alla uppgifter
  // nu, se TodoTimerSection (TodoDetailView.tsx) och handleConfirmComplete
  // nedan.
  onCompleteTodo: (todoId: Id, elapsedMs?: number | null) => void;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onRenameCategory: (id: Id, name: string) => void;
  onRemoveCategory: (id: Id) => void;
  onSetCategoryHidden: (id: Id, hidden: boolean) => void;
  onCreateTaskTemplate: (task: TodoTemplateTask) => Promise<TodoTemplate>;
  onCreateCategoryTemplate: (
    name: string,
    tasks: TodoTemplateTask[],
    sourceCategoryId?: Id | null
  ) => Promise<TodoCategoryTemplate>;
  onUpdateCategoryTemplate: (id: Id, name: string, tasks: TodoTemplateTask[]) => Promise<TodoCategoryTemplate>;
  // Ny kategori-knapp längst till höger i verktygsfältet (2026-07-25, Zaidas
  // önskemål) — samma "tom eller från mall"-flöde som redan fanns inbäddat i
  // TodoCreatorModal.tsx, nu även nåbart direkt från tråd-vyn.
  categoryTemplates: TodoCategoryTemplate[];
  onDeleteTodo: (todoId: Id) => void;
  onAddTodoToCategory: (categoryId: Id | null) => void;
  todoThreadOrder: Id[];
  onReorderThreads: (order: Id[]) => void;
  // Manuell bubbel-ordning inom en enskild tråd (2026-07-24, Zaidas önskemål).
  todoBubbleOrder: Record<Id, Id[]>;
  onReorderBubbles: (threadId: Id, order: Id[]) => void;
  // Hur mycket som visas (2026-07-06, Zaidas önskemål: "bara idag, en vecka,
  // en månad, eller en lång lista på allt i framtiden") — väljs i
  // Inställningar, samma per-medlem-mönster som todoViewMode.
  range: TodoThreadRange;
  // Vågrätt avstånd mellan kategoritrådarna (2026-07-26, Zaidas önskemål:
  // "via ett reglage kunna bestämma avståndet vågrät mellan
  // kategoritrådarna") — px, väljs i Inställningar → Utseende. undefined =
  // ingen anpassning, CSS:s befintliga clamp()-formel gäller.
  threadGap?: number;
  // Bubblornas storlek (2026-07-27, Zaidas önskemål: "man måste även kunna
  // bestämma storlek på bubbelsysslornas bubblor under utseende, inte bara
  // avståndet") — px, väljs i Inställningar → Utseende, samma mönster som
  // threadGap ovan. undefined = ingen anpassning, CSS:s befintliga
  // clamp()-formel gäller.
  bubbleSize?: number;
  fixedTodoTimes: boolean;
  // Barn-tråden döljs som standard (2026-07-31, Zaidas önskemål: "i min
  // egen todo vy skall endast mina egna todos finnas") — en toggle i
  // Inställningar → Utseende visar den igen.
  showChildTodos?: boolean;
};

type Thread = {
  id: Id;
  label: string;
  todos: Todo[];
  deletable: boolean;
  accentColor?: string;
  // Distinkta mottagare bland trådens EGNA uppgifter (innan ett ev. eget
  // person-filter appliceras) — används för att bygga filtreringsmenyn och
  // för att avgöra om den ens ska visas (ingen mening att filtrera en tråd
  // med bara en mottagare). 2026-07-08, Zaidas önskemål: "Vem uppgiften är
  // tilldelad" som filterkriterium, mest relevant i Barn-tråden där flera
  // barns uppgifter blandas.
  assignees: { id: Id; name: string }[];
  // Samlad andel avklarat för kolumnen (2026-07-13, Zaidas önskemål) — andel
  // av periodens uppgifter (samma tidsspann som resten av tråden) som är
  // "done" eller "approved". Räknas från allTodos (ofiltrerad status), INTE
  // thread.todos (bara pending) — annars skulle avklarade uppgifter aldrig
  // synas i beräkningen eftersom de redan försvunnit ur bollistan.
  // null = inga uppgifter i perioden alls (visar ingen procent).
  completedPercent: number | null;
};

// Varje personlig kategori får en egen accentfärg, kopplad till det AKTIVA
// TEMAT (2026-07-05, Zaidas beslut) — cyklar genom temats åtta redan
// definierade accentvariabler (--c0…--c7, se themes.css) istället för att
// hårdkoda egna hex-färger. Byter man tema byts kategorifärgerna med.
export const THEME_ACCENT_COUNT = 8;

export function accentColorForIndex(index: number): string {
  return `var(--c${index % THEME_ACCENT_COUNT})`;
}

export function computeProgress(todo: Todo): number | null {
  if (!todo.subtasks || todo.subtasks.length === 0) return null;
  const done = todo.subtasks.filter((s) => s.done).length;
  return Math.round((done / todo.subtasks.length) * 100);
}

// Bubblornas färgstyrka (2026-08-10, Zaidas önskemål: "de färgstarkaste
// bubblorna skall indikera på att det finns gott om tid... ju mindre tid som
// är kvar... skall bubblorna bli ljusare") — 0 = precis synlig (hela
// tidsfönstret kvar, maximal färgmättnad), 1 = vid/förbi expiresAt (nästan
// urblekt). Bygger på visibleFrom→expiresAt (samma fönster todos redan
// filtreras mot, isTodoVisibleNow/isDueWithinRange) — null om något av dem
// saknas (en uppgift utan tidsgräns ska inte se "bråttom" ut). Konsumeras av
// CSS (--time-urgency, .todo-thread__ball) via en calc()-blandning, inte en
// diskret stegskala, så övergången är mjuk minut för minut.
export function computeTimeUrgency(todo: Todo, now: number): number | null {
  if (!todo.visibleFrom || !todo.expiresAt) return null;
  const start = new Date(todo.visibleFrom).getTime();
  const end = new Date(todo.expiresAt).getTime();
  const total = end - start;
  if (total <= 0) return now >= end ? 1 : 0;
  return Math.max(0, Math.min(1, (now - start) / total));
}

export function assigneeNameFor(todo: Todo, members: Member[]): string {
  if (todo.assignedTo === null) return "Familjen";
  return members.find((m) => m.id === todo.assignedTo)?.name ?? "Okänt barn";
}

// Medlemmens egen färg (satt i Inställningar, Member.color) särskiljer vems
// uppgift det är på en blick — särskilt värdefullt i den gemensamma
// Barn-tråden där flera barns uppgifter blandas (Zaidas beslut 2026-07-05).
export function assigneeColorFor(todo: Todo, members: Member[]): string | undefined {
  return members.find((m) => m.id === todo.assignedTo)?.color ?? undefined;
}

// Sortering på tråden: sluttid (expiresAt) först, starttid (visibleFrom) som
// andra sortering — todos utan tidsangivelse hamnar sist (per Zaidas beslut
// 2026-07-05, se ADR-diskussion i sprint6-mötesdokumentet).
function timeValue(iso: string | null): number {
  return iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY;
}

export function uniqueAssignees(todos: Todo[], members: Member[]): { id: Id; name: string }[] {
  const seen = new Map<Id, string>();
  for (const t of todos) {
    if (t.assignedTo && !seen.has(t.assignedTo)) {
      seen.set(t.assignedTo, members.find((m) => m.id === t.assignedTo)?.name ?? "Okänd");
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

// Samlad andel avklarat för en tråds kolumn (2026-07-13) — matchTodos ska
// vara OFILTRERAT på status (till skillnad från thread.todos, som bara
// visar pending) så done/approved-uppgifter räknas med.
export function computeCompletedPercent(matchTodos: Todo[]): number | null {
  if (matchTodos.length === 0) return null;
  const completed = matchTodos.filter((t) => t.status === "done" || t.status === "approved").length;
  return Math.round((completed / matchTodos.length) * 100);
}

export function sortByEndThenStartTime(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const endDiff = timeValue(a.expiresAt) - timeValue(b.expiresAt);
    if (endDiff !== 0) return endDiff;
    return timeValue(a.visibleFrom) - timeValue(b.visibleFrom);
  });
}

// Bubbel-omordning (2026-07-24, Zaidas önskemål: "jag kanske vill flytta så
// att 'gå och lägg dig' kommer sist") — en återkommande uppgifts dagliga
// occurrence får ett NYTT eget id varje dag (frusen kopia av mallen), så
// ordningen måste bindas till något som överlever regenereringen: mallens id
// (recurringSourceId) om det finns, annars uppgiftens eget (engångsuppgifter).
export function stableBubbleKey(todo: Todo): Id {
  return todo.recurringSourceId ?? todo.id;
}

// Sparad ordning läggs OVANPÅ den automatiska sluttid/starttid-sorteringen —
// bubblor utan en sparad plats hamnar sist, i sin vanliga inbördes ordning
// (samma "olistade hamnar sist"-princip som trådarnas egen todoThreadOrder).
export function applyBubbleOrder(todos: Todo[], order: Id[] | undefined): Todo[] {
  if (!order || order.length === 0) return todos;
  const orderIndex = new Map(order.map((key, i) => [key, i]));
  return [...todos].sort((a, b) => {
    const ai = orderIndex.get(stableBubbleKey(a)) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(stableBubbleKey(b)) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

// isDueWithinRange flyttad till selectors.ts (2026-07-27) — delas nu även
// av TodosView.tsx:s listläge, se selectors.ts för fullständig kommentar.

// Vuxenvyn med delmoment (Sprint 6 S2–S4, ombyggd 2026-07-05 på Zaidas beslut) —
// trådar sida vid sida istället för staplade sektioner, bollarna hålls medvetet
// små så flera kategorier får plats i synfältet samtidigt utan att scrolla.
// Längst till vänster: en gemensam tråd med ALLA barns väntande uppgifter
// (oavsett barn/kategori) — så den vuxna har koll på läget för barnen också.
// Därefter: den vuxnas egna, personliga kategori-trådar (skapas i en separat
// modal från Todos-panelen, döps om/tas bort direkt i tråd-huvudet här) —
// visar todos tilldelade ELLER skapade av den inloggade vuxna. Samma
// kontobreda kategorisystem driver numera även belöningsbutikens
// kategori-spärr och barnens rutinskapare (ADR-0020, 2026-07-08 — ersätter
// det tidigare separata, fasta routineCategory/ROUTINE_CATEGORIES-settet). Kort
// tryck öppnar en läsbar uppgifts-visa-vy (TodoDetailView, 2026-07-05) på
// VILKEN boll som helst — anteckningar, delmomentens checklista om uppgiften
// har några, och en pennikon som öppnar TodoEditModal för att redigera titel/
// kategori/schema/återkommande. Långt tryck (2s, useHoldToConfirm — samma mekanism som barnens
// egen avklarmarkering) markerar hela uppgiften klar oavsett delmoment-status —
// bollen "går upp i rök" (tonas/skalas bort) istället för att bara försvinna direkt.
export function ParentTodoThreadView({
  todos,
  allTodos,
  members,
  roles,
  currentMember,
  categories,
  onToggleSubtask,
  onToggleTodoInProgress,
  onUpdateTodo,
  onRefreshRoutine,
  onCompleteTodo,
  onCreateCategory,
  onRenameCategory,
  onRemoveCategory,
  onSetCategoryHidden,
  onCreateTaskTemplate,
  onCreateCategoryTemplate,
  onUpdateCategoryTemplate,
  categoryTemplates,
  onDeleteTodo,
  onAddTodoToCategory,
  todoThreadOrder,
  onReorderThreads,
  todoBubbleOrder,
  onReorderBubbles,
  range,
  threadGap,
  bubbleSize,
  fixedTodoTimes,
  showChildTodos = false
}: Props) {
  const [detailTodoId, setDetailTodoId] = useState<Id | null>(null);
  const [editTodoId, setEditTodoId] = useState<Id | null>(null);
  // members hålls medvetet ofiltrerad i hela filen (namn-/färguppslag mot
  // historiska todos, se selectors.ts:s getAssigneeName-kommentar) — men
  // "Vem håller på med den här?"-pickern (nedan) är ett VAL, inte ett
  // uppslag, och ska inte erbjuda en redan raderad medlem (2026-07-23,
  // Zaidas fynd).
  const activeMembers = members.filter((m) => m.deletedAt === null);
  const { heldId, startHold, clearHold } = useHoldToConfirm(HOLD_DURATION_MS);
  // Ett lyckat långtryck triggar annars även webbläsarens vanliga click-event
  // vid pointerUp (samma nedtryck+släpp-par som click bygger på) — det skulle
  // öppna checklista-modalen direkt efter att uppgiften redan markerats klar.
  const suppressClickRef = useRef(false);
  // "Någon håller på med den här"-indikator (2026-07-22) — dubbeltryck på
  // bollen öppnar en liten avatarväljare istället för detaljvyn. Ett vanligt
  // enkelt tryck fördröjs medvetet DOUBLE_TAP_MS (standard disambiguerings-
  // mönster mellan klick/dubbelklick) — det gör detaljvyn en aning senare
  // att öppna, en medveten avvägning för att kunna särskilja gesterna.
  // Utökad (2026-08-08) till en riktig tryck-RÄKNARE (inte bara två) — ett
  // tredje snabbt tryck (inom samma DOUBLE_TAP_MS-fönster från FÖREGÅENDE
  // tryck) startar timern istället, Zaidas önskemål: "tidtagning skall
  // starta om man trycker 3 snabba tryck på uppgiften".
  const DOUBLE_TAP_MS = 300;
  const lastTapRef = useRef<{ id: Id; time: number; count: number; rect: DOMRect } | null>(null);
  const pendingClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inProgressPickerTodoId, setInProgressPickerTodoId] = useState<Id | null>(null);
  const [inProgressPickerPos, setInProgressPickerPos] = useState({ top: 0, left: 0 });
  const inProgressPickerRef = useRef<HTMLDivElement>(null);
  // Delad klocka (2026-07-22, gjord ALLTID tickande 2026-08-06) — tickade
  // tidigare bara medan minst en boll hade två eller fler på sig samtidigt,
  // vilket i praktiken frös "nu" på mount-tidpunkten för alla ANDRA syften
  // (bl.a. "idag"-tidsspannets isTodoVisibleNow, se pendingTodos nedan) —
  // en morgonuppgift utan delad "någon håller på med"-status försvann
  // därför aldrig av sig själv när dess tidsfönster gick ut, bara vid nästa
  // omrendering av en helt annan anledning (Zaidas fynd 2026-08-06). Nu
  // samma delade `useNowTick`-hook som FamilyTodoThreads.tsx/
  // MemberShellContent.tsx/ChildShellContent.tsx.
  const nowTick = useNowTick();
  // Bollar som just markerats klara via långtryck — hålls kvar i renderingen
  // (även efter att de lämnat "pending" i props) medan bortdöende-animationen
  // ("gå upp i rök", Zaidas beslut 2026-07-05) spelas upp.
  const [dissolving, setDissolving] = useState<Map<Id, Todo>>(new Map());
  const dissolveTimersRef = useRef<Map<Id, ReturnType<typeof setTimeout>>>(new Map());
  const [editingCategoryId, setEditingCategoryId] = useState<Id | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  // Klick på kategorinamnet öppnar en liten meny (2026-07-05, Zaidas beslut,
  // utökad senare samma dag) — "Lägg till uppgift", "Radera", "Ladda ner"
  // (exporterar bara den kategorins uppgifter som CSV) eller "Göm" (kategorin
  // döljs ur tråd-vyn men finns kvar, visas igen via Inställningar).
  const [menuCategoryId, setMenuCategoryId] = useState<Id | null>(null);
  // "Dela" i kategorimenyn (2026-08-06, Zaidas önskemål: "det skall vara
  // möjligt att dela sina egna kategorier med utvalda familjer") — öppnar
  // TodoCategoryShareModal.tsx.
  const [shareCategoryId, setShareCategoryId] = useState<Id | null>(null);
  // Tvåstegsbekräftelse innan en kategori raderas (2026-08-06, Zaidas
  // önskemål: "om en kategori raderas skall det först komma en varning") —
  // saknades HELT tidigare, ett klick raderade direkt. Samma
  // "stannar öppen mellan de två klicken, återställs vid utsidesklick"-
  // mönster som redan finns i FamilyTodoThreads.tsx:s motsvarande
  // familjekategori-radering.
  const [confirmingDeleteCategoryId, setConfirmingDeleteCategoryId] = useState<Id | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Menyn portalas till document.body (2026-07-08) — kolumnen (.todo-thread)
  // fick eget scroll (overflow-y:auto, se ParentTodoThreadView.css) för att
  // en sticky rubrik ska fungera, vilket annars klipper bort en absolut-
  // positionerad meny som sträcker sig utanför kolumnens synliga yta. Samma
  // portal-mönster som EmojiPickerPortal.tsx redan använder.
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  // Återanvänd kategori (2026-07-08, Zaidas önskemål: t.ex. en packlista man
  // vill starta om inför nästa resa) — ett nytt startdatum sätts på SAMTLIGA
  // uppgifter i kategorin (mallar och engångsuppgifter, inte deras redan
  // genererade dagliga occurrences) och deras delmoment bockas av på nytt.
  const [reuseCategoryId, setReuseCategoryId] = useState<Id | null>(null);
  const [reuseDateInput, setReuseDateInput] = useState("");
  // Visa utgångna (2026-07-08, Zaidas önskemål: "om jag vill se vad jag
  // missat för att fylla i det under dagen i efterhand ska jag kunna välja
  // att se utgångna") — per tråd, av (dolda) som standard, oförändrat
  // beteende om man aldrig slår på det.
  const [showExpiredThreadIds, setShowExpiredThreadIds] = useState<Set<Id>>(new Set());
  // Filtrera efter mottagare (2026-07-08, Zaidas önskemål) — per tråd, av
  // (visar alla) som standard. Map-nyckeln saknas = inget filter aktivt;
  // finns nyckeln = bara de id:n i mängden visas.
  const [filterThreadId, setFilterThreadId] = useState<Id | null>(null);
  const [assigneeFilters, setAssigneeFilters] = useState<Map<Id, Set<Id>>>(new Map());
  // Modalen ska inte stängas om man råkar dra ut en textmarkering utanför
  // den (2026-08-06, Zaidas önskemål) — se useOverlayDismiss.ts.
  const reuseOverlay = useOverlayDismiss(() => setReuseCategoryId(null));
  const filterOverlay = useOverlayDismiss(() => setFilterThreadId(null));

  // Drag-and-drop-ordning på trådarna (2026-07-06, Zaidas önskemål) — håll
  // och dra i kategorinamnet (eller Barn-tråden, som också är flyttbar).
  // Pointer-baserat (inte HTML5 drag-and-drop) för att fungera på touch också.
  const suppressCategoryClickRef = useRef(false);
  const dragStateRef = useRef<{ id: Id; x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<Id | null>(null);
  const [dragOverId, setDragOverId] = useState<Id | null>(null);
  const DRAG_THRESHOLD_PX = 8;

  // Redigeringsläge/flyttläge, PER KATEGORI (2026-07-26, Zaidas önskemål:
  // "tre tryck gör hela kategorin i flyttläge... ta bort alla andra
  // funktioner med pilar osv"). Ersätter den tidigare GLOBALA Pennikon-
  // knappen (2026-07-24) som slog på redigering för ALLA trådar samtidigt —
  // nu triggas det istället av tre snabba tryck på ett specifikt
  // kategorinamn (se handleCategoryClick), och gäller bara DEN kategorin.
  // Samma tre-tryck igen stänger av det (symmetrisk gest, ingen separat
  // "Klar"-knapp behövs). Bara drag-and-drop kvar i flyttläge — knapp-
  // baserade alternativ (upp/ner-pilar per bubbla, Flytta vänster/höger i
  // menyn, Göm-genvägen) togs bort på Zaidas begäran, samma dag de lades
  // till (2026-07-25) som ett "pålitligt alternativ till drag" — hon vill
  // ha renodlat drag istället. Bubblornas vanliga klick/dubbelklick/
  // långtryck-gester stängs medvetet AV i flyttläge — annars skulle de
  // krocka med drag-gesten.
  const [editingThreadId, setEditingThreadId] = useState<Id | null>(null);
  // Trippel-tryck-detektion (samma standardmönster som dubbeltryck-
  // avatarväljaren nedan, bara utökat till tre tryck): varje tryck inom
  // CATEGORY_TAP_MS av föregående räknas till samma "serie", tredje trycket
  // i en serie växlar flyttläge istället för att öppna kategorimenyn.
  const CATEGORY_TAP_MS = 400;
  const categoryTapRef = useRef<{ id: Id; count: number; time: number } | null>(null);
  const categoryTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleDragStateRef = useRef<{ threadId: Id; key: Id; x: number; y: number } | null>(null);
  const [draggingBubbleKey, setDraggingBubbleKey] = useState<Id | null>(null);
  const [bubbleDragOverKey, setBubbleDragOverKey] = useState<Id | null>(null);

  function handleBubblePointerDown(e: React.PointerEvent<HTMLButtonElement>, threadId: Id, key: Id) {
    bubbleDragStateRef.current = { threadId, key, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleBubblePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const start = bubbleDragStateRef.current;
    if (!start) return;
    if (draggingBubbleKey === null) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      setDraggingBubbleKey(start.key);
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const li = el instanceof Element ? el.closest<HTMLElement>("[data-bubble-key]") : null;
    // Bara ett drop-mål inom SAMMA tråd räknas — bubbelordning är per kategori.
    if (li && li.dataset.threadId === start.threadId) {
      setBubbleDragOverKey(li.dataset.bubbleKey as Id);
    } else {
      setBubbleDragOverKey(null);
    }
  }

  function handleBubblePointerUp(threadTodos: Todo[]) {
    const start = bubbleDragStateRef.current;
    const target = bubbleDragOverKey;
    bubbleDragStateRef.current = null;
    if (start && target && start.key !== target) {
      const keys = threadTodos.map(stableBubbleKey);
      const from = keys.indexOf(start.key);
      const to = keys.indexOf(target);
      if (from !== -1 && to !== -1) {
        const next = [...keys];
        next.splice(from, 1);
        next.splice(to, 0, start.key);
        onReorderBubbles(start.threadId, next);
      }
    }
    setDraggingBubbleKey(null);
    setBubbleDragOverKey(null);
  }

  useEffect(
    () => () => {
      for (const timer of dissolveTimersRef.current.values()) clearTimeout(timer);
    },
    []
  );

  useEffect(() => {
    if (!menuCategoryId) return;
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuCategoryId(null);
      setConfirmingDeleteCategoryId(null);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuCategoryId]);

  useEffect(() => {
    if (!inProgressPickerTodoId) return;
    function handleOutsideClick(e: MouseEvent) {
      if (inProgressPickerRef.current?.contains(e.target as Node)) return;
      setInProgressPickerTodoId(null);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [inProgressPickerTodoId]);

  useEffect(
    () => () => {
      if (pendingClickTimerRef.current) window.clearTimeout(pendingClickTimerRef.current);
    },
    []
  );

  const today = new Date();
  // "Idag" = exakt klockslag, inte hela dagen (2026-08-04, Zaidas önskemål:
  // "visaren skall endast visas idag, så uppgifter som har gått ut, eller
  // inte har börjat än skall inte visas") — isDueWithinRange är dag-baserad
  // (en 19:00-uppgift syntes tidigare hela dagen från midnatt), isTodoVisibleNow
  // kräver att NU faktiskt ligger mellan visibleFrom/expiresAt. "Vecka"/
  // "månad"/"allt" förblir dag-baserade (en förhandsvisning längre fram i
  // tiden ska inte kräva att klockan redan slagit om) — samma hybrid-princip
  // som redan gäller PersonalDashboard (MemberShellContent.tsx) sedan tidigare
  // samma dag. nowTick (redan tickande varje sekund för den delade klockan i
  // "någon håller på med den här"-indikatorn) gör att en uppgift dyker upp
  // automatiskt i realtid när dess klockslag inträffar, ingen omladdning krävs.
  // 2026-08-08, Zaidas önskemål: "alla todos som inte markerats som
  // slutförda skall visas om tiden är efter starttid, och före sluttid,
  // oavsett när jag redigerar" — en todo vars STATUS råkar vara "expired"
  // (satt av backendens periodiska expireOverdueTodos-jobb, eller en ännu ej
  // hunnen klientomräkning) räknas nu som aktiv HÄR om dess tidsfönster just
  // nu faktiskt innehåller "nu" — statusfältet är bara en ögonblicksbild,
  // tidsfönstret är sanningen. "expired" behandlas alltså identiskt med
  // "pending" nedan; en genuint avklarad status (done/approved/rejected)
  // exkluderas redan uppströms (TodosView.tsx:s visibleTodos-filter).
  const pendingTodos = todos.filter(
    (t) =>
      (t.status === "pending" || t.status === "expired") &&
      !isRecurringTemplate(t) &&
      (range === "today" ? isTodoVisibleNow(t, nowTick) : isDueWithinRange(t, today, range))
  );
  // Stabila id:n för "aktuellt aktiv oavsett lagrad status" (se ovan) —
  // används av per-tråd-filtren nedan (childBaseTodos/categoryBaseTodos) för
  // att inte kräva "Visa utgångna" för en uppgift som redan räknas som aktiv.
  const currentlyDueIds = new Set(pendingTodos.map((t) => t.id));
  // Utgångna (missade) uppgifter är medvetet UTANFÖR range-filtret ovan — de
  // ska gå att hitta oavsett vilket tidsspann (idag/vecka/månad) som är valt,
  // eftersom hela poängen är att se det man missade, inte bara det som råkar
  // falla inom det vanliga fönstret. Visas bara för trådar där man aktivt
  // slagit på "Visa utgångna" (se showExpiredThreadIds), filtreras in per
  // tråd nedan. Läses från allTodos (ofiltrerad), inte todos — TodosView.tsx
  // filtrerar redan bort status "approved"/"rejected" innan den vanliga
  // todos-propen ens når hit. Dedupat mot currentlyDueIds (ovan) — en
  // expired-status-uppgift som just blivit aktuell igen (tidsfönstret
  // omfattar nu "nu") visas bara en gång, som en vanlig bubbla.
  const expiredTodos = allTodos.filter(
    (t) => t.status === "expired" && !isRecurringTemplate(t) && !currentlyDueIds.has(t.id)
  );
  const visibleTodos = [
    ...pendingTodos,
    ...expiredTodos,
    ...[...dissolving.values()].filter((t) => !pendingTodos.some((p) => p.id === t.id))
  ];

  const threads: Thread[] = useMemo(() => {
    // Filtrera efter mottagare (2026-07-08) — appliceras EFTER övriga filter
    // (status/tidsspann), på precis den tråden det gäller.
    function applyAssigneeFilter(threadId: Id, baseTodos: Todo[]): Todo[] {
      const filter = assigneeFilters.get(threadId);
      if (!filter) return baseTodos;
      return baseTodos.filter((t) => t.assignedTo !== null && filter.has(t.assignedTo));
    }

    // Ofiltrerat på status (till skillnad från visibleTodos, som bara är
    // pending+expired) — underlag för completedPercent, se computeCompletedPercent.
    const allDueTodos = allTodos.filter((t) => !isRecurringTemplate(t) && isDueWithinRange(t, today, range));

    const showChildExpired = showExpiredThreadIds.has(CHILDREN_THREAD_ID);
    const childBaseTodos = visibleTodos.filter(
      (t) =>
        isChildMember(members.find((m) => m.id === t.assignedTo), roles) &&
        (t.status !== "expired" || showChildExpired || currentlyDueIds.has(t.id))
    );
    const childAllTodos = applyAssigneeFilter(
      CHILDREN_THREAD_ID,
      allDueTodos.filter((t) => isChildMember(members.find((m) => m.id === t.assignedTo), roles))
    );
    const childThread: Thread = {
      id: CHILDREN_THREAD_ID,
      label: "Barn",
      deletable: false,
      assignees: uniqueAssignees(childBaseTodos, members),
      todos: applyBubbleOrder(
        sortByEndThenStartTime(applyAssigneeFilter(CHILDREN_THREAD_ID, childBaseTodos)),
        todoBubbleOrder[CHILDREN_THREAD_ID]
      ),
      completedPercent: computeCompletedPercent(childAllTodos)
    };

    // Kategorier är kontobreda sedan 2026-07-07 (Zaidas beslut — alla vuxna ser
    // och kan redigera varandras kategorier i skapa-/redigera-modalen), men
    // tråd-vyns KOLUMNER visar fortsatt bara MINA egna — annars skulle varje
    // vuxens personliga trådar dyka upp som tomma kolumner hos alla andra,
    // vilket varken efterfrågats eller önskvärt (bryter mot minimalism-principen).
    // Familjekategorier (2026-08-03, isFamily:true) hör hemma i Hem-vyn
    // (FamilyTodoThreads.tsx), aldrig här — annars skulle de dyka upp dubbelt.
    const myCategories = categories.filter((c) => c.memberId === currentMember.id && !c.isFamily);
    const categoryThreads: Thread[] = myCategories
      .filter((c) => !c.hidden)
      .map((category, index): Thread | null => {
        const showExpired = showExpiredThreadIds.has(category.id);
        const categoryBaseTodos = visibleTodos.filter(
          (t) =>
            t.personalCategoryId === category.id &&
            (t.assignedTo === currentMember.id || t.createdBy === currentMember.id) &&
            // Barnens uppgifter hör alltid hemma i Barn-tråden, aldrig i en
            // personlig kategori-tråd — även om jag skapat uppgiften åt
            // barnet och satt en av mina egna kategorier på den
            // (2026-07-08, Zaidas fynd/rättelse). Samma princip för Familjen-
            // tråden (2026-07-23) — en otilldelad todo hör bara hemma där.
            t.assignedTo !== null &&
            !isChildMember(members.find((m) => m.id === t.assignedTo), roles) &&
            (t.status !== "expired" || showExpired || currentlyDueIds.has(t.id))
        );
        const categoryAllTodos = applyAssigneeFilter(
          category.id,
          allDueTodos.filter(
            (t) =>
              t.personalCategoryId === category.id &&
              (t.assignedTo === currentMember.id || t.createdBy === currentMember.id) &&
              t.assignedTo !== null &&
              !isChildMember(members.find((m) => m.id === t.assignedTo), roles)
          )
        );
        // Tomma kategorier döljs alltid (2026-08-04, Zaidas önskemål: "tomma
        // kategorier skall inte visas" — 2026-08-05, Zaidas rättelse: gäller
        // ÄVEN en helt ny, aldrig använd kategori. Det ursprungliga
        // undantaget fanns för att kunna NÅ en ny kategoris "Lägg till
        // uppgift"-meny, men den vägen behövs inte längre — "+"-knappen
        // öppnar redan skapa-kategori-flödet direkt).
        // 2026-08-06, Zaidas rättelse: "tom" avgörs nu ENBART av
        // categoryBaseTodos (de FAKTISKT synliga bollarna just nu) — det
        // tidigare "eller categoryAllTodos" (dag-baserat, inkluderar även
        // redan avklarade/godkända uppgifter) lät en kategori bli kvar
        // synlig med bara en tom, bollfri kolumn hela dagen efter att dess
        // enda uppgift antingen redan klarats av ELLER passerat sitt
        // tidsfönster (t.ex. en morgonrutin, sett på eftermiddagen). En
        // kategori ska försvinna så fort den inte har någon AKTUELL boll
        // att visa, och komma tillbaka först när en ny (t.ex. morgondagens
        // genererade occurrence) blir synlig.
        const isEmpty = categoryBaseTodos.length === 0;
        if (isEmpty) return null;
        return {
          id: category.id,
          label: category.name,
          deletable: true,
          accentColor: accentColorForIndex(index),
          assignees: uniqueAssignees(categoryBaseTodos, members),
          todos: applyBubbleOrder(
            sortByEndThenStartTime(applyAssigneeFilter(category.id, categoryBaseTodos)),
            todoBubbleOrder[category.id]
          ),
          completedPercent: computeCompletedPercent(categoryAllTodos)
        };
      })
      .filter((thread): thread is Thread => thread !== null);

    return [...(showChildTodos ? [childThread] : []), ...categoryThreads];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTodos, allTodos, range, members, roles, categories, currentMember.id, showExpiredThreadIds, assigneeFilters, todoBubbleOrder, showChildTodos]);

  // Egen sparad ordning (drag-and-drop, 2026-07-06) — trådar som saknas i
  // listan (t.ex. en nyskapad kategori) hamnar sist, i sin vanliga ordning.
  const orderedThreads: Thread[] = useMemo(() => {
    if (todoThreadOrder.length === 0) return threads;
    const orderIndex = new Map(todoThreadOrder.map((id, i) => [id, i]));
    return [...threads].sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [threads, todoThreadOrder]);

  const detailTodo = todos.find((t) => t.id === detailTodoId) ?? null;
  const editTodo = todos.find((t) => t.id === editTodoId) ?? null;

  function reorderThreads(draggedId: Id, targetId: Id) {
    const currentIds = orderedThreads.map((t) => t.id);
    const from = currentIds.indexOf(draggedId);
    const to = currentIds.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...currentIds];
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    onReorderThreads(next);
  }

  function handleThreadPointerDown(e: React.PointerEvent<HTMLButtonElement>, threadId: Id) {
    dragStateRef.current = { id: threadId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleThreadPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const start = dragStateRef.current;
    if (!start) return;
    if (draggingId === null) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      setDraggingId(start.id);
      suppressCategoryClickRef.current = true;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const section = el instanceof Element ? el.closest<HTMLElement>("[data-thread-id]") : null;
    setDragOverId((section?.dataset.threadId as Id | undefined) ?? null);
  }

  function handleThreadPointerUp() {
    const wasDragging = draggingId;
    const target = dragOverId;
    dragStateRef.current = null;
    if (wasDragging && target && wasDragging !== target) {
      reorderThreads(wasDragging, target);
    }
    setDraggingId(null);
    setDragOverId(null);
  }

  // Dubbeltryck öppnar avatarväljaren istället för detaljvyn (2026-07-22) —
  // ett vanligt enkelt tryck fördröjs medvetet DOUBLE_TAP_MS för att kunna
  // särskilja gesterna, samma standardmönster som klick-kontra-dubbelklick.
  // Bugg fixad (2026-07-26, Zaidas fynd: "modalen hamnar utanför skärmen")
  // — elementet positioneras med position:fixed (viewport-relativt), men
  // koden lade ändå till window.scrollY/scrollX ovanpå getBoundingClientRect()s
  // redan viewport-relativa koordinater, samma fel som redan var korrekt
  // undvikt i kategorimenyns motsvarande kod (handleCategoryClick, ingen
  // scroll-offset där). Klämmer dessutom in positionen mot fönstrets kanter
  // — pickerns bredd/höjd är okänd innan render, en rimlig uppskattning
  // (220×260px) räcker för att undvika att den klipps av när bubblan ligger
  // nära höger/nedre kanten.
  function openInProgressPickerAt(todo: Todo, rect: DOMRect) {
    const ESTIMATED_WIDTH = 220;
    const ESTIMATED_HEIGHT = 260;
    setInProgressPickerPos({
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - ESTIMATED_HEIGHT)),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - ESTIMATED_WIDTH))
    });
    setInProgressPickerTodoId(todo.id);
  }

  function handleBallClick(todo: Todo, e: React.MouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const now = Date.now();
    const last = lastTapRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const count = last && last.id === todo.id && now - last.time < DOUBLE_TAP_MS ? last.count + 1 : 1;

    if (pendingClickTimerRef.current) {
      window.clearTimeout(pendingClickTimerRef.current);
      pendingClickTimerRef.current = null;
    }

    if (count >= 3) {
      // Tre snabba tryck (2026-08-08) NOLLSTÄLLER timern — sista möjliga
      // gesten i sekvensen, ingen ytterligare fördröjning behövs. Nollställ,
      // inte en toggle (2026-08-08, Zaidas andra rättelse: "en nollställning
      // [ska] föra så att den går tillbaka till just 2 min [för en
      // nedräkning]... är det en tidtagning så skall den börja om från 0") —
      // startTodoTimer skriver alltid en NY starttid oavsett tidigare
      // tillstånd, vilket redan ger exakt detta och håller timern igång.
      lastTapRef.current = null;
      if (todo.timerEnabled) startTodoTimer(todo.id);
      return;
    }

    lastTapRef.current = { id: todo.id, time: now, count, rect };
    pendingClickTimerRef.current = window.setTimeout(() => {
      const pending = lastTapRef.current;
      lastTapRef.current = null;
      pendingClickTimerRef.current = null;
      if (!pending) return;
      // Bubbel-nivå timerkontroll (2026-08-09, Zaidas önskemål — samma
      // gester som barnens todo-vy) gäller bara uppgifter UTAN delmoment
      // (de behöver fortsatt modalen, för att bocka av dem) med en aktiv
      // timer — annars faller enkel-/dubbeltryck tillbaka på sitt vanliga
      // beteende (visa-vyn respektive "vem håller på med den här").
      const timerControlEligible =
        todo.timerEnabled &&
        (todo.subtasks?.length ?? 0) === 0 &&
        readTodoTimerIsActive(todo.id, timerCapMinutes(todo));
      if (pending.count >= 2) {
        if (timerControlEligible) {
          // Två snabba tryck nollställer HELT (samma clear() som modalens
          // Nollställ-knapp) — Zaidas ord: "stoppa timern och ta bort
          // aktiveringen för tidtagningen till när man har bättre tid att
          // göra uppgiften". Till skillnad från ett tryck (pausar, BEVARAR
          // tiden) kastas den förflutna tiden bort permanent här.
          clearTodoTimer(todo.id);
        } else {
          openInProgressPickerAt(todo, pending.rect);
        }
      } else if (timerControlEligible) {
        // Ett ensamt tryck pausar/återupptar direkt i bubblan.
        toggleTodoTimerPause(todo.id, timerCapMinutes(todo));
      } else {
        setDetailTodoId(todo.id);
      }
    }, DOUBLE_TAP_MS);
  }

  // elapsedAtHoldStart fångas vid pointerDown (håll-in-STARTEN, se
  // onPointerDown nedan), inte här — annars räknas hela 2-sekunders-hållet
  // in i den sparade tiden (Zaidas fynd 2026-08-10: "tidtagningen måste
  // stoppas när man börjar hålla 2 sekunder, inte efter 2-3 sekunder").
  function handleConfirmComplete(todo: Todo, elapsedAtHoldStart: number | null) {
    suppressClickRef.current = true;
    setDissolving((current) => new Map(current).set(todo.id, todo));
    // En eventuell pågående ELLER PAUSAD timer (2026-08-07/09, startas med
    // tre snabba tryck på bubblan eller via knappen i TodoDetailView,
    // avslutas här via den redan befintliga håll-in-gesten — fungerar
    // oavsett om den råkar vara pausad just då) räknas ut och skickas med,
    // oavsett om uppgiften faktiskt hann öppnas via visa-vyn eller ej.
    const elapsedMs = elapsedAtHoldStart;
    if (elapsedMs !== null) {
      clearTodoTimer(todo.id);
      onCompleteTodo(todo.id, elapsedMs);
    } else {
      onCompleteTodo(todo.id);
    }
    const timer = setTimeout(() => {
      setDissolving((current) => {
        const next = new Map(current);
        next.delete(todo.id);
        return next;
      });
      dissolveTimersRef.current.delete(todo.id);
    }, DISSOLVE_DURATION_MS);
    dissolveTimersRef.current.set(todo.id, timer);
  }

  function startEditingCategory(category: TodoCategory) {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  }

  function saveEditingCategory() {
    const trimmed = editingCategoryName.trim();
    if (editingCategoryId && trimmed) {
      onRenameCategory(editingCategoryId, trimmed);
    }
    setEditingCategoryId(null);
    setEditingCategoryName("");
  }

  function handleCategoryClick(thread: Thread, event: React.MouseEvent<HTMLButtonElement>) {
    if (suppressCategoryClickRef.current) {
      suppressCategoryClickRef.current = false;
      return;
    }

    const now = Date.now();
    const last = categoryTapRef.current;
    const count = last && last.id === thread.id && now - last.time < CATEGORY_TAP_MS ? last.count + 1 : 1;
    categoryTapRef.current = { id: thread.id, count, time: now };
    if (categoryTapTimerRef.current) {
      window.clearTimeout(categoryTapTimerRef.current);
      categoryTapTimerRef.current = null;
    }

    if (count >= 3) {
      categoryTapRef.current = null;
      setMenuCategoryId(null);
      setEditingThreadId((current) => (current === thread.id ? null : thread.id));
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    categoryTapTimerRef.current = window.setTimeout(() => {
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
      setMenuCategoryId((current) => (current === thread.id ? null : thread.id));
      categoryTapTimerRef.current = null;
    }, CATEGORY_TAP_MS);
  }

  function handleRenameFromMenu(categoryId: Id) {
    const category = categories.find((c) => c.id === categoryId);
    setMenuCategoryId(null);
    if (category) startEditingCategory(category);
  }

  function handleAddTodoFromMenu(categoryId: Id | null) {
    setMenuCategoryId(null);
    onAddTodoToCategory(categoryId);
  }

  function handleToggleExpiredFromMenu(threadId: Id) {
    setMenuCategoryId(null);
    setShowExpiredThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function handleFilterFromMenu(threadId: Id) {
    setMenuCategoryId(null);
    setFilterThreadId(threadId);
  }

  function toggleAssigneeFilter(threadId: Id, assigneeId: Id, allAssignees: { id: Id }[]) {
    setAssigneeFilters((prev) => {
      const next = new Map(prev);
      const current = next.get(threadId) ?? new Set(allAssignees.map((a) => a.id));
      const updated = new Set(current);
      if (updated.has(assigneeId)) updated.delete(assigneeId);
      else updated.add(assigneeId);
      next.set(threadId, updated);
      return next;
    });
  }

  function clearAssigneeFilter(threadId: Id) {
    setAssigneeFilters((prev) => {
      const next = new Map(prev);
      next.delete(threadId);
      return next;
    });
  }

  function handleDeleteFromMenu(categoryId: Id) {
    if (confirmingDeleteCategoryId !== categoryId) {
      setConfirmingDeleteCategoryId(categoryId);
      return;
    }
    setMenuCategoryId(null);
    setConfirmingDeleteCategoryId(null);
    onRemoveCategory(categoryId);
  }

  function handleDownloadFromMenu(categoryId: Id) {
    setMenuCategoryId(null);
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    const categoryTodos = todos.filter((t) => t.personalCategoryId === categoryId);
    const csv = todosToCsv(categoryTodos, members, currentMember.id, categories);
    const safeName = category.name.trim().replace(/[^\p{L}\p{N}]+/gu, "-") || "kategori";
    downloadCsv(`todos-${safeName}.csv`, csv);
  }

  function handleHideFromMenu(categoryId: Id) {
    setMenuCategoryId(null);
    onSetCategoryHidden(categoryId, true);
  }

  function handleShareFromMenu(categoryId: Id) {
    setMenuCategoryId(null);
    setShareCategoryId(categoryId);
  }

  // Mallbibliotek (2026-07-08) — sparar en frusen ögonblicksbild av kategorins
  // DEFINIERANDE uppgifter (mallar och engångsuppgifter, inte deras redan
  // genererade dagliga occurrences — samma urval som handleReuseFromMenu
  // använder). Kategorin/uppgifterna rörs inte, bara läses.
  //
  // 2026-07-28, Zaidas önskemål: "man ska alltid kunna uppdatera mallen i
  // kategorimenyn, om man tex ändrat ordning på dem" — har kategorin redan
  // en länkad mall (sourceCategoryId) UPPDATERAS den mallen istället för att
  // skapa en ny, duplicerad. Bara den FÖRSTA sparningen skapar en ny mall.
  function handleSaveCategoryAsTemplate(categoryId: Id) {
    setMenuCategoryId(null);
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    const tasks: TodoTemplateTask[] = allTodos
      .filter((t) => t.personalCategoryId === categoryId && t.deletedAt === null && t.recurringSourceId === null)
      .map((t) => ({
        title: t.title,
        visual: t.visual,
        notes: t.notes ?? null,
        subtasks: (t.subtasks ?? []).map((s) => ({ title: s.title, timedMinutes: s.timedMinutes ?? null })),
        recurrence: t.recurrence,
        starValue: t.starValue,
        // Tidtagning (2026-08-06, Zaidas fynd: "mallen saknade timer-fält").
        timerEnabled: t.timerEnabled ?? false,
        plannedDurationMinutes: t.plannedDurationMinutes ?? null
      }));
    if (tasks.length === 0) return;
    const existing = categoryTemplates.find((t) => t.sourceCategoryId === categoryId);
    if (existing) {
      onUpdateCategoryTemplate(existing.id, category.name, tasks);
    } else {
      onCreateCategoryTemplate(category.name, tasks, categoryId);
    }
  }

  function handleReuseFromMenu(categoryId: Id) {
    setMenuCategoryId(null);
    setReuseCategoryId(categoryId);
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setReuseDateInput(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  }

  // Samma dag, ny klockslag (om uppgiften redan hade ett) — bara datumdelen
  // byts ut, samma princip som recurringTodos.ts:s withOccurrenceDate.
  function withNewDate(oldVisibleFrom: string | null, newDateStr: string): string {
    const [year, month, day] = newDateStr.split("-").map(Number);
    if (!oldVisibleFrom) {
      return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
    }
    const old = new Date(oldVisibleFrom);
    return new Date(
      year, month - 1, day,
      old.getHours(), old.getMinutes(), old.getSeconds(), old.getMilliseconds()
    ).toISOString();
  }

  function handleConfirmReuse() {
    if (!reuseCategoryId || !reuseDateInput) return;
    // Mallar och engångsuppgifter i kategorin — INTE deras redan genererade
    // dagliga occurrences (de är frusna kopior för en specifik redan passerad
    // dag, ska inte skrivas om i efterhand).
    const targets = allTodos.filter(
      (t) => t.personalCategoryId === reuseCategoryId && t.deletedAt === null && t.recurringSourceId === null
    );
    for (const t of targets) {
      onUpdateTodo(t.id, {
        visibleFrom: withNewDate(t.visibleFrom, reuseDateInput),
        subtasks: t.subtasks?.map((s) => ({ ...s, done: false }))
      });
    }
    setReuseCategoryId(null);
    setReuseDateInput("");
  }

  return (
    <>
    <div
      className="todo-thread-view"
      style={
        {
          ...(threadGap != null ? { "--todo-thread-gap": `${threadGap}px` } : {}),
          ...(bubbleSize != null ? { "--todo-bubble-size-override": `${bubbleSize}px` } : {})
        } as React.CSSProperties
      }
    >
      {orderedThreads.map((thread) => (
        <section
          key={thread.id}
          data-thread-id={thread.id}
          className={
            "todo-thread" +
            (draggingId === thread.id ? " todo-thread--dragging" : "") +
            (dragOverId === thread.id && draggingId !== thread.id ? " todo-thread--drop-target" : "") +
            (editingThreadId === thread.id ? " todo-thread--editing" : "")
          }
          aria-label={`Tråd: ${thread.label}`}
          style={thread.accentColor ? ({ "--thread-accent": thread.accentColor } as React.CSSProperties) : undefined}
        >
          <div className="todo-thread__header">
            {editingCategoryId === thread.id ? (
              <input
                autoFocus
                className="todo-thread__category-input"
                value={editingCategoryName}
                onChange={(e) => setEditingCategoryName(e.target.value)}
                onBlur={saveEditingCategory}
                // Markerar hela namnet vid fokus (2026-08-07) — se samma fix i
                // FamilyTodoThreads.tsx för grundorsaken (annars hamnar
                // markören bara vid slutet av det förifyllda namnet, en
                // skriven bokstav LÄGGS TILL istället för att ERSÄTTA).
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditingCategory();
                  if (e.key === "Escape") setEditingCategoryId(null);
                }}
              />
            ) : (
              <h3 className="todo-thread__category">
                <button
                  type="button"
                  className={
                    "todo-thread__category-button" +
                    (draggingId === thread.id ? " todo-thread__category-button--dragging" : "")
                  }
                  aria-expanded={menuCategoryId === thread.id}
                  aria-pressed={editingThreadId === thread.id}
                  aria-label={`${thread.label}. Klicka för fler val, håll och dra för att flytta tråden, tre snabba tryck för att växla flyttläge.`}
                  onClick={(e) => handleCategoryClick(thread, e)}
                  onPointerDown={(e) => handleThreadPointerDown(e, thread.id)}
                  onPointerMove={handleThreadPointerMove}
                  onPointerUp={handleThreadPointerUp}
                  onPointerCancel={handleThreadPointerUp}
                >
                  {thread.label}
                </button>
              </h3>
            )}

            {/* Samlad andel avklarat, som en påfyllnadsstapel under
                kategorinamnet (2026-07-24, Zaidas önskemål — ersätter en
                tidigare procenttext längst ner i kolumnen som lätt missades).
                null = inga uppgifter i perioden alls, visar då ingen stapel
                istället för en missvisande tom/full stapel. */}
            {/* Alltid renderad, oavsett om thread.completedPercent finns
                (2026-08-09, Zaidas fynd: "kategorierna skall vara i samma
                höjd") — annars blev en kolumns rubrik kortare för en tom
                kategori (ingen stapel alls) än en med data, vilket lät
                bollarna starta på olika höjd sida vid sida. Osynlig
                (--empty) men lika hög istället för helt borttagen. */}
            <div
              {...(thread.completedPercent !== null
                ? {
                    "aria-label": `${thread.completedPercent}% avklarat`,
                    "aria-valuemax": 100,
                    "aria-valuemin": 0,
                    "aria-valuenow": thread.completedPercent,
                    role: "progressbar"
                  }
                : {})}
              className={
                "todo-thread__progress-track" +
                (thread.completedPercent === null ? " todo-thread__progress-track--empty" : "")
              }
            >
              <div className="todo-thread__progress-fill" style={{ width: `${thread.completedPercent ?? 0}%` }} />
            </div>

            {/* Den gemensamma Barn-tråden är varken döpbar/raderbar/nedladdningsbar
                (ingen riktig TodoCategory-post) — bara "Lägg till uppgift" (utan
                förvald kategori), ersätter 2026-07-06 den borttagna fristående
                +-knappen som fallback när inga personliga kategorier finns än. */}
            {menuCategoryId === thread.id &&
              createPortal(
                <div
                  className="todo-thread__category-menu"
                  ref={menuRef}
                  style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
                >
                  {thread.deletable && (
                    <button onClick={() => handleRenameFromMenu(thread.id)} type="button">
                      Byt namn
                    </button>
                  )}
                  <button
                    onClick={() => handleAddTodoFromMenu(thread.deletable ? thread.id : null)}
                    type="button"
                  >
                    Lägg till uppgift
                  </button>
                  <button onClick={() => handleToggleExpiredFromMenu(thread.id)} type="button">
                    {showExpiredThreadIds.has(thread.id) ? "Dölj utgångna" : "Visa utgångna"}
                  </button>
                  {thread.assignees.length > 1 && (
                    <button onClick={() => handleFilterFromMenu(thread.id)} type="button">
                      Filtrera efter person
                    </button>
                  )}
                  {thread.deletable && (
                    <>
                      <button onClick={() => handleDownloadFromMenu(thread.id)} type="button">
                        Ladda ner
                      </button>
                      <button onClick={() => handleReuseFromMenu(thread.id)} type="button">
                        Återanvänd
                      </button>
                      <button onClick={() => handleSaveCategoryAsTemplate(thread.id)} type="button">
                        {categoryTemplates.some((t) => t.sourceCategoryId === thread.id)
                          ? "Uppdatera mall"
                          : "Spara som mall"}
                      </button>
                      <button onClick={() => handleHideFromMenu(thread.id)} type="button">
                        Göm
                      </button>
                      <button onClick={() => handleShareFromMenu(thread.id)} type="button">
                        Dela
                      </button>
                      {confirmingDeleteCategoryId === thread.id && (
                        <p className="field-hint">
                          {(() => {
                            const count = allTodos.filter(
                              (t) => t.personalCategoryId === thread.id && t.deletedAt === null
                            ).length;
                            return count > 0
                              ? `${count} ${count === 1 ? "uppgift blir" : "uppgifter blir"} okategoriserad${count === 1 ? "" : "e"} — hittas sedan under "Mina uppgifter".`
                              : "Kategorin tas bort permanent.";
                          })()}
                        </p>
                      )}
                      <button
                        className="todo-thread__category-menu-danger"
                        onClick={() => handleDeleteFromMenu(thread.id)}
                        type="button"
                      >
                        {confirmingDeleteCategoryId === thread.id ? "Bekräfta radering" : "Radera"}
                      </button>
                    </>
                  )}
                </div>,
                document.body
              )}
          </div>

          {thread.todos.length > 0 && (
            <ul className="todo-thread__list">
              {thread.todos.map((todo) => {
                const progress = computeProgress(todo);
                const assignee = assigneeNameFor(todo, members);
                const assigneeColor = assigneeColorFor(todo, members);
                const isDissolving = dissolving.has(todo.id);
                // Barnens bubblor görs mycket mindre än vuxnas egna
                // kategori-trådar (2026-07-06, Zaidas begäran) — golvat på
                // 44px, det minsta tillåtna touch-målet (CLAUDE.md), inte lägre.
                const isChildrenThread = thread.id === CHILDREN_THREAD_ID;
                // "Någon håller på med den här"-indikator (2026-07-22) — en
                // ensam person: tjock kant i personens färg. Två eller fler:
                // ingen tävling, bara en delad klocka som räknar från
                // inProgressSince (samma för alla, oavsett vem som gick med sist).
                const inProgressMembers = (todo.inProgressBy ?? [])
                  .map((id) => members.find((m) => m.id === id))
                  .filter((m): m is Member => !!m);
                const inProgressColor =
                  inProgressMembers.length === 1 ? inProgressMembers[0].color ?? "var(--primary)" : null;
                const sharedElapsedLabel =
                  inProgressMembers.length >= 2 && todo.inProgressSince
                    ? formatElapsed(nowTick - new Date(todo.inProgressSince).getTime())
                    : null;
                const bubbleKey = stableBubbleKey(todo);
                const timeUrgency = computeTimeUrgency(todo, nowTick);
                return (
                  <li
                    key={todo.id}
                    className={
                      "todo-thread__item" +
                      ((editingThreadId === thread.id) && draggingBubbleKey === bubbleKey ? " todo-thread__item--dragging" : "") +
                      ((editingThreadId === thread.id) && bubbleDragOverKey === bubbleKey && draggingBubbleKey !== bubbleKey
                        ? " todo-thread__item--drop-target"
                        : "")
                    }
                    data-thread-id={thread.id}
                    data-bubble-key={bubbleKey}
                    style={
                      {
                        ...(assigneeColor ? { "--assignee-color": assigneeColor } : {}),
                        ...(inProgressColor ? { "--in-progress-color": inProgressColor } : {}),
                        ...(timeUrgency !== null ? { "--time-urgency": timeUrgency } : {})
                      } as React.CSSProperties
                    }
                  >
                    <button
                      type="button"
                      className={
                        "todo-thread__ball" +
                        (isChildrenThread ? " todo-thread__ball--small" : "") +
                        (heldId === todo.id ? " todo-thread__ball--holding" : "") +
                        (isDissolving ? " todo-thread__ball--dissolving" : "") +
                        (inProgressColor ? " todo-thread__ball--in-progress" : "") +
                        ((editingThreadId === thread.id) ? " todo-thread__ball--edit" : "")
                      }
                      disabled={isDissolving}
                      onClick={(e) => {
                        if (!(editingThreadId === thread.id)) handleBallClick(todo, e);
                      }}
                      onPointerDown={(e) => {
                        if ((editingThreadId === thread.id)) { handleBubblePointerDown(e, thread.id, bubbleKey); return; }
                        const elapsedAtHoldStart = readTodoTimerElapsedMs(todo.id, timerCapMinutes(todo));
                        startHold(todo.id, () => handleConfirmComplete(todo, elapsedAtHoldStart));
                      }}
                      onPointerMove={(editingThreadId === thread.id) ? handleBubblePointerMove : undefined}
                      onPointerUp={() => {
                        if ((editingThreadId === thread.id)) { handleBubblePointerUp(thread.todos); return; }
                        clearHold();
                      }}
                      onPointerLeave={editingThreadId !== thread.id ? clearHold : undefined}
                      onPointerCancel={() => {
                        if ((editingThreadId === thread.id)) { handleBubblePointerUp(thread.todos); return; }
                        clearHold();
                      }}
                      title={todo.title}
                      aria-label={
                        (editingThreadId === thread.id)
                          ? `${todo.title}. Håll och dra för att flytta ordningen inom ${thread.label}.`
                          : `${todo.title}, tilldelad ${assignee}` +
                            (progress !== null ? `, ${progress} procent av delmomenten avklarade` : "") +
                            (inProgressMembers.length > 0
                              ? `. ${inProgressMembers.map((m) => m.name).join(", ")} håller på med den här.`
                              : "") +
                            ". Håll intryckt i två sekunder för att markera hela uppgiften klar. Dubbeltryck för att markera att du håller på."
                      }
                    >
                      {todo.visual.value && (
                        <span aria-hidden="true" className="todo-thread__ball-icon">
                          {todo.visual.value}
                        </span>
                      )}
                      <span className="todo-thread__ball-title">{todo.title}</span>
                      {progress !== null && (
                        <span className="todo-thread__ball-progress">{progress}%</span>
                      )}
                      {(() => {
                        const timerLabel = bubbleTimerLabel(todo);
                        return timerLabel !== null ? (
                          <span aria-live="polite" className="todo-thread__ball-timer">
                            ⏱ {timerLabel}
                          </span>
                        ) : null;
                      })()}
                    </button>

                    {inProgressMembers.length >= 2 && (
                      <div className="todo-thread__in-progress" aria-hidden="true">
                        <span className="todo-thread__in-progress-dots">
                          {inProgressMembers.map((m) => (
                            <span
                              className="todo-thread__in-progress-dot"
                              key={m.id}
                              style={{ background: m.color ?? "var(--primary)" }}
                            />
                          ))}
                        </span>
                        <span className="todo-thread__in-progress-clock">{sharedElapsedLabel}</span>
                      </div>
                    )}

                    {inProgressPickerTodoId === todo.id &&
                      createPortal(
                        <div
                          className="todo-thread__category-menu"
                          ref={inProgressPickerRef}
                          role="menu"
                          style={{ position: "fixed", top: inProgressPickerPos.top, left: inProgressPickerPos.left }}
                        >
                          <p className="todo-thread__in-progress-picker-label">Vem håller på med den här?</p>
                          {activeMembers.map((m) => {
                            const isOn = inProgressMembers.some((im) => im.id === m.id);
                            return (
                              <button
                                aria-pressed={isOn}
                                key={m.id}
                                onClick={() => {
                                  onToggleTodoInProgress(todo.id, m.id);
                                  setInProgressPickerTodoId(null);
                                }}
                                type="button"
                              >
                                {isOn ? "✓ " : ""}
                                {m.name}
                              </button>
                            );
                          })}
                        </div>,
                        document.body
                      )}
                  </li>
                );
              })}
            </ul>
          )}

        </section>
      ))}
      </div>

      {detailTodo && (
        <TodoDetailView
          todo={detailTodo}
          assigneeName={assigneeNameFor(detailTodo, members)}
          assigneeColor={assigneeColorFor(detailTodo, members)}
          categoryName={categories.find((c) => c.id === detailTodo.personalCategoryId)?.name ?? null}
          members={members}
          onToggleSubtask={onToggleSubtask}
          onComplete={onCompleteTodo}
          onClose={() => setDetailTodoId(null)}
          onEdit={() => {
            setEditTodoId(detailTodo.id);
            setDetailTodoId(null);
          }}
        />
      )}

      {editTodo && (
        <TodoEditModal
          todo={editTodo}
          currentMember={currentMember}
          members={members}
          roles={roles}
          categories={categories}
          todos={allTodos}
          onUpdateTodo={onUpdateTodo}
          onCreateCategory={onCreateCategory}
          onCreateTaskTemplate={onCreateTaskTemplate}
          onDeleteTodo={onDeleteTodo}
          onRefreshRoutine={onRefreshRoutine}
          onClose={() => setEditTodoId(null)}
          fixedTodoTimes={fixedTodoTimes}
        />
      )}

      {reuseCategoryId && (
        <div className="todo-thread-view__reuse-overlay" {...reuseOverlay}>
          <div
            aria-labelledby="reuse-category-title"
            aria-modal="true"
            className="todo-thread-view__reuse-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h3 id="reuse-category-title">
              Återanvänd {categories.find((c) => c.id === reuseCategoryId)?.name ?? ""}
            </h3>
            <p className="field-hint field-hint--neutral">
              Alla uppgifter i kategorin får det nya startdatumet och deras delmoment bockas av på nytt.
            </p>
            <label className="field-label">
              Nytt startdatum
              <input
                className="text-input"
                onChange={(e) => setReuseDateInput(e.target.value)}
                type="date"
                value={reuseDateInput}
              />
            </label>
            <div className="todo-thread-view__reuse-actions">
              <button className="secondary-button" onClick={() => setReuseCategoryId(null)} type="button">
                Avbryt
              </button>
              <button
                className="primary-button"
                disabled={!reuseDateInput}
                onClick={handleConfirmReuse}
                type="button"
              >
                Uppdatera
              </button>
            </div>
          </div>
        </div>
      )}

      {shareCategoryId && (
        <TodoCategoryShareModal
          categoryId={shareCategoryId}
          categoryName={categories.find((c) => c.id === shareCategoryId)?.name ?? ""}
          currentMember={currentMember}
          members={members}
          onClose={() => setShareCategoryId(null)}
          roles={roles}
        />
      )}

      {filterThreadId &&
        (() => {
          const filterThread = orderedThreads.find((t) => t.id === filterThreadId);
          if (!filterThread) return null;
          const selected = assigneeFilters.get(filterThreadId) ?? null;
          return (
            <div className="todo-thread-view__reuse-overlay" {...filterOverlay}>
              <div
                aria-labelledby="filter-thread-title"
                aria-modal="true"
                className="todo-thread-view__reuse-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
              >
                <h3 id="filter-thread-title">Filtrera {filterThread.label}</h3>
                <div className="todo-thread-view__filter-options">
                  {filterThread.assignees.map((a) => (
                    <label className="todo-thread-view__filter-option" key={a.id}>
                      <input
                        checked={selected === null || selected.has(a.id)}
                        onChange={() => toggleAssigneeFilter(filterThreadId, a.id, filterThread.assignees)}
                        type="checkbox"
                      />
                      {a.name}
                    </label>
                  ))}
                </div>
                <div className="todo-thread-view__reuse-actions">
                  <button
                    className="secondary-button"
                    onClick={() => clearAssigneeFilter(filterThreadId)}
                    type="button"
                  >
                    Visa alla
                  </button>
                  <button className="primary-button" onClick={() => setFilterThreadId(null)} type="button">
                    Stäng
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}
