import "./ParentTodoThreadView.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Id, Member, Role, Todo, TodoCategory, TodoThreadRange } from "@shared/types";
import { TodoDetailView } from "./TodoDetailView";
import { TodoEditModal } from "./TodoEditModal";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { downloadCsv, todosToCsv } from "./todoCsv";
import { isRecurringTemplate } from "./recurringTodos";
import { isChildMember } from "./selectors";

const HOLD_DURATION_MS = 2000;
// Måste matcha CSS-animationens längd (todo-thread-dissolve i .css) — bollen
// hålls kvar i DOM:en så länge, tonad med --dissolving-klassen, innan den
// faktiskt tas bort ur listan.
const DISSOLVE_DURATION_MS = 500;
const CHILDREN_THREAD_ID = "__children__";

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
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: Id) => void;
  onCompleteTodo: (todoId: Id) => void;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onRenameCategory: (id: Id, name: string) => void;
  onRemoveCategory: (id: Id) => void;
  onSetCategoryHidden: (id: Id, hidden: boolean) => void;
  onDeleteTodo: (todoId: Id) => void;
  onAddTodoToCategory: (categoryId: Id | null) => void;
  todoThreadOrder: Id[];
  onReorderThreads: (order: Id[]) => void;
  // Hur mycket som visas (2026-07-06, Zaidas önskemål: "bara idag, en vecka,
  // en månad, eller en lång lista på allt i framtiden") — väljs i
  // Inställningar, samma per-medlem-mönster som todoViewMode.
  range: TodoThreadRange;
};

type Thread = {
  id: Id;
  label: string;
  todos: Todo[];
  deletable: boolean;
  accentColor?: string;
};

// Varje personlig kategori får en egen accentfärg, kopplad till det AKTIVA
// TEMAT (2026-07-05, Zaidas beslut) — cyklar genom temats åtta redan
// definierade accentvariabler (--c0…--c7, se themes.css) istället för att
// hårdkoda egna hex-färger. Byter man tema byts kategorifärgerna med.
const THEME_ACCENT_COUNT = 8;

function accentColorForIndex(index: number): string {
  return `var(--c${index % THEME_ACCENT_COUNT})`;
}

function computeProgress(todo: Todo): number | null {
  if (!todo.subtasks || todo.subtasks.length === 0) return null;
  const done = todo.subtasks.filter((s) => s.done).length;
  return Math.round((done / todo.subtasks.length) * 100);
}

function assigneeNameFor(todo: Todo, members: Member[]): string {
  return members.find((m) => m.id === todo.assignedTo)?.name ?? "Okänt barn";
}

// Medlemmens egen färg (satt i Inställningar, Member.color) särskiljer vems
// uppgift det är på en blick — särskilt värdefullt i den gemensamma
// Barn-tråden där flera barns uppgifter blandas (Zaidas beslut 2026-07-05).
function assigneeColorFor(todo: Todo, members: Member[]): string | undefined {
  return members.find((m) => m.id === todo.assignedTo)?.color ?? undefined;
}

// Sortering på tråden: sluttid (expiresAt) först, starttid (visibleFrom) som
// andra sortering — todos utan tidsangivelse hamnar sist (per Zaidas beslut
// 2026-07-05, se ADR-diskussion i sprint6-mötesdokumentet).
function timeValue(iso: string | null): number {
  return iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY;
}

function sortByEndThenStartTime(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const endDiff = timeValue(a.expiresAt) - timeValue(b.expiresAt);
    if (endDiff !== 0) return endDiff;
    return timeValue(a.visibleFrom) - timeValue(b.visibleFrom);
  });
}

// Hur mycket som visas (2026-07-06, Zaidas önskemål) — en todo räknas som
// inom spannet om dess synlighetsfönster (visibleFrom–expiresAt) övertäcker
// någon del av det, eller om den saknar schema helt (då är den inte knuten
// till en viss dag/period och ska alltid synas). "Idag" (standard) beter sig
// precis som tidigare — bara "week"/"month"/"all" är nya. "all" har ingen
// bortre gräns (allt i framtiden), men utgångna uppgifter (until <= nu)
// filtreras fortfarande bort, precis som i övriga spann.
function rangeLengthInDays(range: TodoThreadRange): number | null {
  if (range === "today") return 1;
  if (range === "week") return 7;
  if (range === "month") return 30;
  return null;
}

function isDueWithinRange(todo: Todo, today: Date, range: TodoThreadRange): boolean {
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = rangeLengthInDays(range);
  const rangeEnd = days === null ? Number.POSITIVE_INFINITY : dayStart + days * 24 * 60 * 60 * 1000;
  const from = todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.NEGATIVE_INFINITY;
  const until = todo.expiresAt ? new Date(todo.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  return from < rangeEnd && until > dayStart;
}

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
  onUpdateTodo,
  onRefreshRoutine,
  onCompleteTodo,
  onCreateCategory,
  onRenameCategory,
  onRemoveCategory,
  onSetCategoryHidden,
  onDeleteTodo,
  onAddTodoToCategory,
  todoThreadOrder,
  onReorderThreads,
  range
}: Props) {
  const [detailTodoId, setDetailTodoId] = useState<Id | null>(null);
  const [editTodoId, setEditTodoId] = useState<Id | null>(null);
  const { heldId, startHold, clearHold } = useHoldToConfirm(HOLD_DURATION_MS);
  // Ett lyckat långtryck triggar annars även webbläsarens vanliga click-event
  // vid pointerUp (samma nedtryck+släpp-par som click bygger på) — det skulle
  // öppna checklista-modalen direkt efter att uppgiften redan markerats klar.
  const suppressClickRef = useRef(false);
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

  // Drag-and-drop-ordning på trådarna (2026-07-06, Zaidas önskemål) — håll
  // och dra i kategorinamnet (eller Barn-tråden, som också är flyttbar).
  // Pointer-baserat (inte HTML5 drag-and-drop) för att fungera på touch också.
  const suppressCategoryClickRef = useRef(false);
  const dragStateRef = useRef<{ id: Id; x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<Id | null>(null);
  const [dragOverId, setDragOverId] = useState<Id | null>(null);
  const DRAG_THRESHOLD_PX = 8;

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

  const today = new Date();
  // Återkommande MALLAR (recurringSourceId===null, recurrence!=="none") ska
  // aldrig visas som en egen boll — bara deras dagliga OCCURRENCE (frusen
  // kopia, recurrence:"none") gör det. Utan detta blev mallen synlig som en
  // andra, till synes duplicerad boll bredvid sin egen occurrence (upptäckt
  // 2026-07-06 av Zaida — mallen saknar riktiga tider (bara ankardatumet),
  // occurrensen har de faktiska tiderna från timeWindows, vilket gjorde
  // dubbletten synlig först efter att flera tidsintervall infördes).
  const pendingTodos = todos.filter(
    (t) => t.status === "pending" && !isRecurringTemplate(t) && isDueWithinRange(t, today, range)
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
    const showChildExpired = showExpiredThreadIds.has(CHILDREN_THREAD_ID);
    const childThread: Thread = {
      id: CHILDREN_THREAD_ID,
      label: "Barn",
      deletable: false,
      todos: sortByEndThenStartTime(
        visibleTodos.filter(
          (t) =>
            isChildMember(members.find((m) => m.id === t.assignedTo), roles) &&
            (t.status !== "expired" || showChildExpired)
        )
      )
    };

    // Kategorier är kontobreda sedan 2026-07-07 (Zaidas beslut — alla vuxna ser
    // och kan redigera varandras kategorier i skapa-/redigera-modalen), men
    // tråd-vyns KOLUMNER visar fortsatt bara MINA egna — annars skulle varje
    // vuxens personliga trådar dyka upp som tomma kolumner hos alla andra,
    // vilket varken efterfrågats eller önskvärt (bryter mot minimalism-principen).
    const myCategories = categories.filter((c) => c.memberId === currentMember.id);
    const categoryThreads: Thread[] = myCategories.filter((c) => !c.hidden).map((category, index) => {
      const showExpired = showExpiredThreadIds.has(category.id);
      return {
        id: category.id,
        label: category.name,
        deletable: true,
        accentColor: accentColorForIndex(index),
        todos: sortByEndThenStartTime(
          visibleTodos.filter(
            (t) =>
              t.personalCategoryId === category.id &&
              (t.assignedTo === currentMember.id || t.createdBy === currentMember.id) &&
              (t.status !== "expired" || showExpired)
          )
        )
      };
    });

    return [childThread, ...categoryThreads];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTodos, members, roles, categories, currentMember.id, showExpiredThreadIds]);

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

  function handleBallClick(todo: Todo) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setDetailTodoId(todo.id);
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

  function handleCategoryClick(thread: Thread) {
    if (suppressCategoryClickRef.current) {
      suppressCategoryClickRef.current = false;
      return;
    }
    setMenuCategoryId((current) => (current === thread.id ? null : thread.id));
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
    <div className="todo-thread-view">
      {orderedThreads.map((thread) => (
        <section
          key={thread.id}
          data-thread-id={thread.id}
          className={
            "todo-thread" +
            (draggingId === thread.id ? " todo-thread--dragging" : "") +
            (dragOverId === thread.id && draggingId !== thread.id ? " todo-thread--drop-target" : "")
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
                  aria-label={`${thread.label}. Klicka för fler val, håll och dra för att flytta tråden.`}
                  onClick={() => handleCategoryClick(thread)}
                  onPointerDown={(e) => handleThreadPointerDown(e, thread.id)}
                  onPointerMove={handleThreadPointerMove}
                  onPointerUp={handleThreadPointerUp}
                  onPointerCancel={handleThreadPointerUp}
                >
                  {thread.label}
                </button>
              </h3>
            )}

            {/* Den gemensamma Barn-tråden är varken döpbar/raderbar/nedladdningsbar
                (ingen riktig TodoCategory-post) — bara "Lägg till uppgift" (utan
                förvald kategori), ersätter 2026-07-06 den borttagna fristående
                +-knappen som fallback när inga personliga kategorier finns än. */}
            {menuCategoryId === thread.id && (
              <div className="todo-thread__category-menu" ref={menuRef}>
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
                {thread.deletable && (
                  <>
                    <button onClick={() => handleDownloadFromMenu(thread.id)} type="button">
                      Ladda ner
                    </button>
                    <button onClick={() => handleReuseFromMenu(thread.id)} type="button">
                      Återanvänd
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
              </div>
            )}
          </div>

          {thread.todos.length === 0 ? (
            <p className="todo-thread__empty">Allt avklarat här 🎉</p>
          ) : (
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
                return (
                  <li
                    key={todo.id}
                    className="todo-thread__item"
                    style={assigneeColor ? ({ "--assignee-color": assigneeColor } as React.CSSProperties) : undefined}
                  >
                    <button
                      type="button"
                      className={
                        "todo-thread__ball" +
                        (isChildrenThread ? " todo-thread__ball--small" : "") +
                        (heldId === todo.id ? " todo-thread__ball--holding" : "") +
                        (isDissolving ? " todo-thread__ball--dissolving" : "")
                      }
                      disabled={isDissolving}
                      onClick={() => handleBallClick(todo)}
                      onPointerDown={() => startHold(todo.id, () => handleConfirmComplete(todo))}
                      onPointerUp={clearHold}
                      onPointerLeave={clearHold}
                      onPointerCancel={clearHold}
                      title={todo.title}
                      aria-label={
                        `${todo.title}, tilldelad ${assignee}` +
                        (progress !== null ? `, ${progress} procent av delmomenten avklarade` : "") +
                        ". Håll intryckt i två sekunder för att markera hela uppgiften klar."
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
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      {detailTodo && (
        <TodoDetailView
          todo={detailTodo}
          assigneeName={assigneeNameFor(detailTodo, members)}
          assigneeColor={assigneeColorFor(detailTodo, members)}
          categoryName={categories.find((c) => c.id === detailTodo.personalCategoryId)?.name ?? null}
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
          onDeleteTodo={onDeleteTodo}
          onRefreshRoutine={onRefreshRoutine}
          onClose={() => setEditTodoId(null)}
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
    </div>
  );
}
