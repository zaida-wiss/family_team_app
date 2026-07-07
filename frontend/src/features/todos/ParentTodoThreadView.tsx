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
  members: Member[];
  roles: Role[];
  currentMember: Member;
  categories: TodoCategory[];
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
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
// visar todos tilldelade ELLER skapade av den inloggade vuxna. Helt separat
// från routineCategory/ROUTINE_CATEGORIES, som fortsatt driver
// belöningsbutikens kategori-spärr och barnens rutinskapare oförändrat. Kort
// tryck öppnar en läsbar uppgifts-visa-vy (TodoDetailView, 2026-07-05) på
// VILKEN boll som helst — anteckningar, delmomentens checklista om uppgiften
// har några, och en pennikon som öppnar TodoEditModal för att redigera titel/
// kategori/schema/återkommande. Långt tryck (2s, useHoldToConfirm — samma mekanism som barnens
// egen avklarmarkering) markerar hela uppgiften klar oavsett delmoment-status —
// bollen "går upp i rök" (tonas/skalas bort) istället för att bara försvinna direkt.
export function ParentTodoThreadView({
  todos,
  members,
  roles,
  currentMember,
  categories,
  onToggleSubtask,
  onUpdateTodo,
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
  const visibleTodos = [
    ...pendingTodos,
    ...[...dissolving.values()].filter((t) => !pendingTodos.some((p) => p.id === t.id))
  ];

  const threads: Thread[] = useMemo(() => {
    const childThread: Thread = {
      id: CHILDREN_THREAD_ID,
      label: "Barn",
      deletable: false,
      todos: sortByEndThenStartTime(
        visibleTodos.filter((t) => isChildMember(members.find((m) => m.id === t.assignedTo), roles))
      )
    };

    const categoryThreads: Thread[] = categories.filter((c) => !c.hidden).map((category, index) => ({
      id: category.id,
      label: category.name,
      deletable: true,
      accentColor: accentColorForIndex(index),
      todos: sortByEndThenStartTime(
        visibleTodos.filter(
          (t) =>
            t.personalCategoryId === category.id &&
            (t.assignedTo === currentMember.id || t.createdBy === currentMember.id)
        )
      )
    }));

    return [childThread, ...categoryThreads];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTodos, members, roles, categories, currentMember.id]);

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

  function handleDeleteFromMenu(categoryId: Id) {
    setMenuCategoryId(null);
    onRemoveCategory(categoryId);
  }

  function handleDownloadFromMenu(categoryId: Id) {
    setMenuCategoryId(null);
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;
    const categoryTodos = todos.filter((t) => t.personalCategoryId === categoryId);
    const csv = todosToCsv(categoryTodos, members, currentMember.id);
    const safeName = category.name.trim().replace(/[^\p{L}\p{N}]+/gu, "-") || "kategori";
    downloadCsv(`todos-${safeName}.csv`, csv);
  }

  function handleHideFromMenu(categoryId: Id) {
    setMenuCategoryId(null);
    onSetCategoryHidden(categoryId, true);
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
                {thread.deletable && (
                  <>
                    <button onClick={() => handleDownloadFromMenu(thread.id)} type="button">
                      Ladda ner
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
          members={members}
          roles={roles}
          categories={categories}
          onUpdateTodo={onUpdateTodo}
          onCreateCategory={onCreateCategory}
          onDeleteTodo={onDeleteTodo}
          onClose={() => setEditTodoId(null)}
        />
      )}
    </div>
  );
}
