import "./ParentTodoThreadView.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Info, Plus, X } from "lucide-react";
import { TodoStatsModal } from "./TodoStatsModal";
import { NEW_CATEGORY_VALUE } from "./TodoCreatorModal";
import type { Id, Member, Role, Todo, TodoCategory, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask, TodoThreadRange } from "@shared/types";
import { TodoDetailView } from "./TodoDetailView";
import { TodoEditModal } from "./TodoEditModal";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { downloadCsv, todosToCsv } from "./todoCsv";
import { dateOnlyToISO, isRecurringTemplate } from "./recurringTodos";
import { isChildMember, isDueWithinRange, isTodoVisibleNow } from "./selectors";
import { generateId } from "../../utils/uuid";

const HOLD_DURATION_MS = 2000;
// Måste matcha CSS-animationens längd (todo-thread-dissolve i .css) — bollen
// hålls kvar i DOM:en så länge, tonad med --dissolving-klassen, innan den
// faktiskt tas bort ur listan.
const DISSOLVE_DURATION_MS = 500;
const CHILDREN_THREAD_ID = "__children__";
// Mina uppgifter (2026-07-31, Zaidas önskemål) — en alltid-synlig, icke-
// döpbar/raderbar tråd för todos tilldelade mig direkt men utanför en av
// mina egna personliga kategorier. Familjen-tråden (assignedTo: null)
// flyttade samma dag helt till Hem-vyn, se selectors.ts:s getFamilyViewTodos.
const MY_TASKS_THREAD_ID = "__mine__";

// Exporterad (2026-08-01) för återanvändning i FamilyTodoThreads.tsx — Hem-
// vyns familjebubblor ska ha "samma gester och kategorimenyer som todovyn"
// (Zaidas önskemål), samma tidsformattering för den delade in-progress-klockan.
export function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  // Massradering i "Mina uppgifter" (2026-08-03) — en uppgift som INTE är min
  // egen (någon annan skapade/tilldelade den) ska bara sluta vara tilldelad
  // mig i bulk, inte raderas, se handleBulkRemoveSelected nedan.
  onUnassignSelf: (todoId: Id) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: Id) => void;
  onCompleteTodo: (todoId: Id) => void;
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
  onCreateTodo: (todo: Todo) => void;
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
const THEME_ACCENT_COUNT = 8;

function accentColorForIndex(index: number): string {
  return `var(--c${index % THEME_ACCENT_COUNT})`;
}

export function computeProgress(todo: Todo): number | null {
  if (!todo.subtasks || todo.subtasks.length === 0) return null;
  const done = todo.subtasks.filter((s) => s.done).length;
  return Math.round((done / todo.subtasks.length) * 100);
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
  onUnassignSelf,
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
  onCreateTodo,
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
  const DOUBLE_TAP_MS = 300;
  const lastTapRef = useRef<{ id: Id; time: number } | null>(null);
  const pendingClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inProgressPickerTodoId, setInProgressPickerTodoId] = useState<Id | null>(null);
  const [inProgressPickerPos, setInProgressPickerPos] = useState({ top: 0, left: 0 });
  const inProgressPickerRef = useRef<HTMLDivElement>(null);
  // Delad klocka (2026-07-22) — tickar bara medan minst en boll faktiskt har
  // två eller fler på sig samtidigt, annars onödigt att rendera om varje sekund.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const hasSharedTimer = todos.some((t) => (t.inProgressBy?.length ?? 0) >= 2);
  useEffect(() => {
    if (!hasSharedTimer) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasSharedTimer]);
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
  // Massradering i "Mina uppgifter" (2026-08-03, Zaidas önskemål) — en egen,
  // separat lägesstate (inte editingThreadId, som styr drag-omordning) så de
  // två aldrig krockar. Bara MY_TASKS_THREAD_ID erbjuder "Välj flera" i
  // kategorimenyn, men state:t är generellt hållet ifall det utökas senare.
  const [selectingThreadId, setSelectingThreadId] = useState<Id | null>(null);
  const [selectedTodoIds, setSelectedTodoIds] = useState<Set<Id>>(new Set());
  // Trippel-tryck-detektion (samma standardmönster som dubbeltryck-
  // avatarväljaren nedan, bara utökat till tre tryck): varje tryck inom
  // CATEGORY_TAP_MS av föregående räknas till samma "serie", tredje trycket
  // i en serie växlar flyttläge istället för att öppna kategorimenyn.
  const CATEGORY_TAP_MS = 400;
  const categoryTapRef = useRef<{ id: Id; count: number; time: number } | null>(null);
  const categoryTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Instruktionsknapp (2026-07-25, Zaidas önskemål — ersätter den tidigare
  // fasta undertexten "Dagens familjebubblor – pilla på en när den är
  // klar!" som togs bort ur TodosView.tsx samma dag).
  const [showInfo, setShowInfo] = useState(false);
  // Statistik-knapp (2026-07-25, Zaidas önskemål).
  const [showStats, setShowStats] = useState(false);

  // Ny kategori-knapp (+) längst till höger (2026-07-25, Zaidas önskemål:
  // "lägga till en ny kategori eller hämta en från mall"). 2026-08-05,
  // Zaidas rättelse: "aldrig bara en kategori" — det tidigare "Tom
  // kategori"-läget (skapade en kategori helt utan uppgift) togs bort. Vill
  // man INTE använda en sparad kategorimall öppnas nu hela Ny uppgift-
  // modalen direkt i "+Ny kategori…"-läge (samma onAddTodoToCategory-prop
  // som redan används av kategorimenyns "Lägg till uppgift", bara med
  // NEW_CATEGORY_VALUE istället för ett riktigt kategori-id eller null) —
  // kategori och första uppgift skapas då alltid i samma steg. Finns inga
  // sparade kategorimallar alls hoppar "+"-knappen över den här minimodalen
  // helt och öppnar Ny uppgift-modalen direkt, se knappens onClick nedan.
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryTemplateId, setNewCategoryTemplateId] = useState("");
  const [newCategoryTemplateStartDate, setNewCategoryTemplateStartDate] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const canSubmitNewCategory = Boolean(newCategoryTemplateId && newCategoryTemplateStartDate);

  function closeNewCategoryModal() {
    setShowNewCategory(false);
    setNewCategoryTemplateId("");
    setNewCategoryTemplateStartDate("");
  }

  function openCreateModalForNewCategory() {
    closeNewCategoryModal();
    onAddTodoToCategory(NEW_CATEGORY_VALUE);
  }

  async function submitNewCategory() {
    if (!canSubmitNewCategory || creatingCategory) return;
    setCreatingCategory(true);
    try {
      const template = categoryTemplates.find((t) => t.id === newCategoryTemplateId);
      if (!template) return;
      const category = await onCreateCategory(template.name);
      for (const task of template.tasks) {
        onCreateTodo({
          id: `todo-${generateId()}`,
          title: task.title,
          createdBy: currentMember.id,
          assignedTo: currentMember.id,
          isShared: false,
          status: "pending",
          starValue: task.starValue,
          visual: task.visual,
          recurrence: task.recurrence,
          recurringSourceId: null,
          occurrenceDate: null,
          visibleFrom: dateOnlyToISO(newCategoryTemplateStartDate),
          expiresAt: null,
          completedAt: null,
          approvedBy: null,
          approvedAt: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectedReason: null,
          deletedAt: null,
          deletedBy: null,
          personalCategoryId: category.id,
          notes: null,
          subtasks: task.subtasks.map((s) => ({ id: generateId(), title: s.title, done: false })),
          timerEnabled: false,
          plannedDurationMinutes: null,
          elapsedMs: null
        });
      }
    } finally {
      setCreatingCategory(false);
      closeNewCategoryModal();
    }
  }
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
  const pendingTodos = todos.filter(
    (t) =>
      t.status === "pending" &&
      !isRecurringTemplate(t) &&
      (range === "today" ? isTodoVisibleNow(t, nowTick) : isDueWithinRange(t, today, range))
  );
  // Utgångna (missade) uppgifter är medvetet UTANFÖR range-filtret ovan — de
  // ska gå att hitta oavsett vilket tidsspann (idag/vecka/månad) som är valt,
  // eftersom hela poängen är att se det man missade, inte bara det som råkar
  // falla inom det vanliga fönstret. Visas bara för trådar där man aktivt
  // slagit på "Visa utgångna" (se showExpiredThreadIds), filtreras in per
  // tråd nedan. Läses från allTodos (ofiltrerad), inte todos — TodosView.tsx
  // filtrerar redan bort status "expired" via isTodoHistory innan den vanliga
  // todos-propen ens når hit.
  const expiredTodos = allTodos.filter((t) => t.status === "expired" && !isRecurringTemplate(t));
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
        (t.status !== "expired" || showChildExpired)
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
            (t.status !== "expired" || showExpired)
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
        const isEmpty = categoryBaseTodos.length === 0 && categoryAllTodos.length === 0;
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

    // Mina uppgifter (2026-07-31, Zaidas önskemål: "de todos som är
    // assignade på mig skall visas i todovyn") — en uppgift tilldelad mig
    // direkt men UTANFÖR en av mina egna kategorier (ingen kategori alls,
    // eller en ANNAN vuxens kategori — tidigare osynlig här, tråd-vyns
    // kolumner visar bara ägarens egna kategorier). Familjen (assignedTo:
    // null) hör numera bara hemma i Hem-vyn (se selectors.ts:s
    // getFamilyViewTodos), även de jag själv skapat. En uppgift jag signat
    // upp på därifrån (inProgressBy) blandas MEDVETET INTE in här (Zaidas
    // rättelse 2026-08-01) — visas istället i en egen tråd per familj, se
    // TodosView.tsx:s familySignedUpSources/FamilyTodoThreads.tsx.
    const myCategoryIds = new Set(myCategories.map((c) => c.id));
    const isMyTask = (t: Todo) =>
      t.assignedTo === currentMember.id && !(t.personalCategoryId && myCategoryIds.has(t.personalCategoryId));
    const showMyTasksExpired = showExpiredThreadIds.has(MY_TASKS_THREAD_ID);
    const myTasksBaseTodos = visibleTodos.filter(
      (t) => isMyTask(t) && (t.status !== "expired" || showMyTasksExpired)
    );
    const myTasksAllTodos = applyAssigneeFilter(MY_TASKS_THREAD_ID, allDueTodos.filter(isMyTask));
    const myTasksThread: Thread = {
      id: MY_TASKS_THREAD_ID,
      label: "Mina uppgifter",
      deletable: false,
      assignees: uniqueAssignees(myTasksBaseTodos, members),
      todos: applyBubbleOrder(
        sortByEndThenStartTime(applyAssigneeFilter(MY_TASKS_THREAD_ID, myTasksBaseTodos)),
        todoBubbleOrder[MY_TASKS_THREAD_ID]
      ),
      completedPercent: computeCompletedPercent(myTasksAllTodos)
    };

    return [...(showChildTodos ? [childThread] : []), myTasksThread, ...categoryThreads];
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
  function handleBallClick(todo: Todo, e: React.MouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === todo.id && now - last.time < DOUBLE_TAP_MS) {
      if (pendingClickTimerRef.current) {
        window.clearTimeout(pendingClickTimerRef.current);
        pendingClickTimerRef.current = null;
      }
      lastTapRef.current = null;
      const rect = e.currentTarget.getBoundingClientRect();
      // Bugg fixad (2026-07-26, Zaidas fynd: "modalen hamnar utanför
      // skärmen") — elementet positioneras med position:fixed (viewport-
      // relativt), men koden lade ändå till window.scrollY/scrollX ovanpå
      // getBoundingClientRect()s redan viewport-relativa koordinater, samma
      // fel som redan var korrekt undvikt i kategorimenyns motsvarande kod
      // (handleCategoryClick, ingen scroll-offset där). Klämmer dessutom in
      // positionen mot fönstrets kanter — pickerns bredd/höjd är okänd innan
      // render, en rimlig uppskattning (220×260px) räcker för att undvika
      // att den klipps av när bubblan ligger nära höger/nedre kanten.
      const ESTIMATED_WIDTH = 220;
      const ESTIMATED_HEIGHT = 260;
      setInProgressPickerPos({
        top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - ESTIMATED_HEIGHT)),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - ESTIMATED_WIDTH))
      });
      setInProgressPickerTodoId(todo.id);
      return;
    }

    lastTapRef.current = { id: todo.id, time: now };
    pendingClickTimerRef.current = window.setTimeout(() => {
      setDetailTodoId(todo.id);
      pendingClickTimerRef.current = null;
    }, DOUBLE_TAP_MS);
  }

  function handleConfirmComplete(todo: Todo) {
    suppressClickRef.current = true;
    setDissolving((current) => new Map(current).set(todo.id, todo));
    onCompleteTodo(todo.id);
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

  // Massradering i "Mina uppgifter" (2026-08-03, Zaidas önskemål: "hur kan
  // jag massradera todos smidigt i Mina uppgifter?"). Bara MY_TASKS_THREAD_ID
  // erbjuder valet i menyn (se JSX nedan) — logiken här är generell.
  function handleSelectMultipleFromMenu(threadId: Id) {
    setMenuCategoryId(null);
    setEditingThreadId(null); // flyttläge och väljläge ska aldrig vara aktiva samtidigt
    setSelectedTodoIds(new Set());
    setSelectingThreadId(threadId);
  }

  function toggleTodoSelected(todoId: Id) {
    setSelectedTodoIds((prev) => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
  }

  function handleCancelSelecting() {
    setSelectingThreadId(null);
    setSelectedTodoIds(new Set());
  }

  // Zaidas exakta regel: en uppgift som INTE är min egen (någon annan
  // skapade/tilldelade den till mig) ska bara sluta vara tilldelad mig, inte
  // raderas — "familjens todon skall endast gå att tas bort från
  // familjevyn" (Hem-vyns familjeflik). MY_TASKS_THREAD_ID innehåller bara
  // uppgifter tilldelade mig (assignedTo===mig), så createdBy är den enda
  // kvarvarande signalen på vem uppgiften egentligen "tillhör".
  function handleBulkRemoveSelected() {
    for (const todoId of selectedTodoIds) {
      const todo = todos.find((t) => t.id === todoId);
      if (!todo) continue;
      if (todo.createdBy === currentMember.id) {
        onDeleteTodo(todoId);
      } else {
        onUnassignSelf(todoId);
      }
    }
    handleCancelSelecting();
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
    setMenuCategoryId(null);
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
        starValue: t.starValue
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
    <div className="todo-thread-view-wrapper">
      <div className="todo-thread-view__toolbar">
        <h2 className="todo-thread-view__toolbar-title">Bubbelsysslor ✨</h2>
        <div className="todo-thread-view__toolbar-actions">
          <button
            aria-label="Hur fungerar bubbelsysslorna?"
            className="icon-button"
            onClick={() => setShowInfo(true)}
            title="Hur fungerar bubbelsysslorna?"
            type="button"
          >
            <Info size={16} />
          </button>
          <button
            aria-label="Statistik"
            className="icon-button"
            onClick={() => setShowStats(true)}
            title="Statistik — senaste 7 dagarna"
            type="button"
          >
            <BarChart3 size={16} />
          </button>
          <button
            aria-label="Ny kategori"
            className="icon-button"
            onClick={() => {
              // Inget att välja mellan utan sparade kategorimallar — hoppa
              // rakt till Ny uppgift-modalens "+Ny kategori…"-läge istället
              // för att visa en minimodal utan reellt innehåll.
              if (categoryTemplates.length === 0) {
                onAddTodoToCategory(NEW_CATEGORY_VALUE);
                return;
              }
              setShowNewCategory(true);
            }}
            title="Ny kategori — från mall, eller som en del av en ny uppgift"
            type="button"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {showStats && (
        <TodoStatsModal members={members} todos={allTodos} onClose={() => setShowStats(false)} />
      )}

      {showNewCategory && (
        <div className="todo-thread-view__reuse-overlay" onClick={closeNewCategoryModal}>
          <div
            aria-labelledby="new-category-title"
            aria-modal="true"
            className="todo-thread-view__reuse-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="todo-thread-view__info-header">
              <h3 id="new-category-title">Ny kategori från mall</h3>
              <button aria-label="Stäng" className="icon-button" onClick={closeNewCategoryModal} type="button">
                <X size={16} />
              </button>
            </div>

            <label className="field-label">
              Mall
              <select
                className="text-input"
                onChange={(e) => setNewCategoryTemplateId(e.target.value)}
                value={newCategoryTemplateId}
              >
                <option disabled value="">Välj en mall…</option>
                {categoryTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.tasks.length} uppgifter)</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Startdatum för uppgifterna
              <input
                className="text-input"
                onChange={(e) => setNewCategoryTemplateStartDate(e.target.value)}
                type="date"
                value={newCategoryTemplateStartDate}
              />
            </label>

            {/* "Tom kategori" borttagen (2026-08-05, Zaidas beslut: "aldrig
                bara en kategori") — vill man inte använda en mall öppnas
                istället Ny uppgift-modalen direkt i "+Ny kategori…"-läge,
                kategori och första uppgift skapas då i samma steg. */}
            <button
              className="secondary-button"
              onClick={openCreateModalForNewCategory}
              type="button"
            >
              Skapa istället via en ny uppgift…
            </button>

            <div className="todo-thread-view__reuse-actions">
              <button className="secondary-button" onClick={closeNewCategoryModal} type="button">
                Avbryt
              </button>
              <button
                className="primary-button"
                disabled={!canSubmitNewCategory || creatingCategory}
                onClick={() => void submitNewCategory()}
                type="button"
              >
                {creatingCategory ? "Skapar…" : "Skapa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="todo-thread-view__reuse-overlay" onClick={() => setShowInfo(false)}>
          <div
            aria-labelledby="bubble-info-title"
            aria-modal="true"
            className="todo-thread-view__reuse-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="todo-thread-view__info-header">
              <h3 id="bubble-info-title">Så fungerar bubbelsysslorna</h3>
              <button aria-label="Stäng" className="icon-button" onClick={() => setShowInfo(false)} type="button">
                <X size={16} />
              </button>
            </div>
            <ul className="todo-thread-view__info-list">
              <li><strong>Kort tryck</strong> på en bubbla öppnar uppgiften — anteckningar och delmoment.</li>
              <li><strong>Dubbeltryck</strong> markerar att du håller på med uppgiften, så andra ser det.</li>
              <li><strong>Håll intryckt i två sekunder</strong> markerar hela uppgiften klar.</li>
              <li><strong>Håll och dra i ett kategorinamn</strong> för att ändra ordning på trådarna.</li>
              <li><strong>Tre snabba tryck på ett kategorinamn</strong> växlar flyttläge för just den kategorin — dra då enskilda bubblor för att ändra ordning inom kategorin (kategorin i sig går alltid att dra i, oavsett läge).</li>
            </ul>
          </div>
        </div>
      )}
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
            {thread.completedPercent !== null && (
              <div
                aria-label={`${thread.completedPercent}% avklarat`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={thread.completedPercent}
                className="todo-thread__progress-track"
                role="progressbar"
              >
                <div className="todo-thread__progress-fill" style={{ width: `${thread.completedPercent}%` }} />
              </div>
            )}

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
                  {thread.id === MY_TASKS_THREAD_ID && (
                    <button onClick={() => handleSelectMultipleFromMenu(thread.id)} type="button">
                      Välj flera
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
                      <button
                        className="todo-thread__category-menu-danger"
                        onClick={() => handleDeleteFromMenu(thread.id)}
                        type="button"
                      >
                        Radera
                      </button>
                    </>
                  )}
                </div>,
                document.body
              )}
          </div>

          {selectingThreadId === thread.id && (
            <div className="todo-thread__select-bar">
              <span className="todo-thread__select-count">{selectedTodoIds.size} valda</span>
              <button
                className="todo-thread__select-remove danger-button"
                disabled={selectedTodoIds.size === 0}
                onClick={handleBulkRemoveSelected}
                type="button"
              >
                Ta bort
              </button>
              <button onClick={handleCancelSelecting} type="button">
                Avbryt
              </button>
            </div>
          )}

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
                const isSelecting = selectingThreadId === thread.id;
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
                        ...(inProgressColor ? { "--in-progress-color": inProgressColor } : {})
                      } as React.CSSProperties
                    }
                  >
                    <button
                      type="button"
                      aria-pressed={isSelecting ? selectedTodoIds.has(todo.id) : undefined}
                      className={
                        "todo-thread__ball" +
                        (isChildrenThread ? " todo-thread__ball--small" : "") +
                        (heldId === todo.id ? " todo-thread__ball--holding" : "") +
                        (isDissolving ? " todo-thread__ball--dissolving" : "") +
                        (inProgressColor ? " todo-thread__ball--in-progress" : "") +
                        ((editingThreadId === thread.id) ? " todo-thread__ball--edit" : "") +
                        (isSelecting ? " todo-thread__ball--selecting" : "") +
                        (isSelecting && selectedTodoIds.has(todo.id) ? " todo-thread__ball--selected" : "")
                      }
                      disabled={isDissolving}
                      onClick={(e) => {
                        if (isSelecting) { toggleTodoSelected(todo.id); return; }
                        if (!(editingThreadId === thread.id)) handleBallClick(todo, e);
                      }}
                      onPointerDown={(e) => {
                        if (isSelecting) return;
                        if ((editingThreadId === thread.id)) { handleBubblePointerDown(e, thread.id, bubbleKey); return; }
                        startHold(todo.id, () => handleConfirmComplete(todo));
                      }}
                      onPointerMove={(!isSelecting && editingThreadId === thread.id) ? handleBubblePointerMove : undefined}
                      onPointerUp={() => {
                        if (isSelecting) return;
                        if ((editingThreadId === thread.id)) { handleBubblePointerUp(thread.todos); return; }
                        clearHold();
                      }}
                      onPointerLeave={(!isSelecting && editingThreadId !== thread.id) ? clearHold : undefined}
                      onPointerCancel={() => {
                        if (isSelecting) return;
                        if ((editingThreadId === thread.id)) { handleBubblePointerUp(thread.todos); return; }
                        clearHold();
                      }}
                      title={todo.title}
                      aria-label={
                        isSelecting
                          ? `${todo.title}${selectedTodoIds.has(todo.id) ? ", vald" : ""}. Tryck för att välja/avmarkera.`
                          : (editingThreadId === thread.id)
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
        <div className="todo-thread-view__reuse-overlay" onClick={() => setReuseCategoryId(null)}>
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

      {filterThreadId &&
        (() => {
          const filterThread = orderedThreads.find((t) => t.id === filterThreadId);
          if (!filterThread) return null;
          const selected = assigneeFilters.get(filterThreadId) ?? null;
          return (
            <div className="todo-thread-view__reuse-overlay" onClick={() => setFilterThreadId(null)}>
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
    </div>
  );
}
