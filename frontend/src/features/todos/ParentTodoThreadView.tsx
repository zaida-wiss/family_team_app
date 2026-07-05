import "./ParentTodoThreadView.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Id, Member, Role, Todo, TodoCategory } from "@shared/types";
import { SubtaskChecklistModal } from "./SubtaskChecklistModal";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { generateId } from "../../utils/uuid";

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
  onCompleteTodo: (todoId: Id) => void;
  onCreateTodo: (todo: Todo) => void;
  onCreateCategory: (name: string) => void;
  onRenameCategory: (id: Id, name: string) => void;
  onRemoveCategory: (id: Id) => void;
};

type Thread = {
  id: Id;
  label: string;
  todos: Todo[];
  deletable: boolean;
};

function computeProgress(todo: Todo): number | null {
  if (!todo.subtasks || todo.subtasks.length === 0) return null;
  const done = todo.subtasks.filter((s) => s.done).length;
  return Math.round((done / todo.subtasks.length) * 100);
}

function assigneeNameFor(todo: Todo, members: Member[]): string {
  return members.find((m) => m.id === todo.assignedTo)?.name ?? "Okänt barn";
}

function isChildMember(member: Member | undefined, roles: Role[]): boolean {
  if (!member) return false;
  if (member.isChild) return true;
  return roles.find((r) => r.id === member.roleId)?.isChildRole ?? false;
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

// Vuxenvyn med delmoment (Sprint 6 S2–S4, ombyggd 2026-07-05 på Zaidas beslut) —
// trådar sida vid sida istället för staplade sektioner, så nästa grej att göra
// alltid syns utan att scrolla. Längst till vänster: en gemensam tråd med ALLA
// barns väntande uppgifter (oavsett barn/kategori) — så den vuxna har koll på
// läget för barnen också. Därefter: den vuxnas egna, personliga kategori-trådar
// (skapas/döps om/tas bort av den inloggade medlemmen själv, delas inte med
// resten av kontot) — visar todos tilldelade ELLER skapade av den inloggade
// vuxna. Helt separat från routineCategory/ROUTINE_CATEGORIES, som fortsatt
// driver belöningsbutikens kategori-spärr och barnens rutinskapare oförändrat.
// Kort tryck öppnar en avbockningsbar checklista-modal (bara för todos som har
// delmoment). Långt tryck (2s, useHoldToConfirm — samma mekanism som barnens
// egen avklarmarkering) markerar hela uppgiften klar oavsett delmoment-status —
// bollen "går upp i rök" (tonas/skalas bort) istället för att bara försvinna direkt.
export function ParentTodoThreadView({
  todos,
  members,
  roles,
  currentMember,
  categories,
  onToggleSubtask,
  onCompleteTodo,
  onCreateTodo,
  onCreateCategory,
  onRenameCategory,
  onRemoveCategory
}: Props) {
  const [checklistTodoId, setChecklistTodoId] = useState<Id | null>(null);
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
  const [newCategoryName, setNewCategoryName] = useState<string | null>(null);
  const [addingTodoInThread, setAddingTodoInThread] = useState<Id | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState("");

  useEffect(
    () => () => {
      for (const timer of dissolveTimersRef.current.values()) clearTimeout(timer);
    },
    []
  );

  const pendingTodos = todos.filter((t) => t.status === "pending");
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

    const categoryThreads: Thread[] = categories.map((category) => ({
      id: category.id,
      label: category.name,
      deletable: true,
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

  const checklistTodo = todos.find((t) => t.id === checklistTodoId) ?? null;

  function handleBallClick(todo: Todo, hasSubtasks: boolean) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (hasSubtasks) setChecklistTodoId(todo.id);
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

  function submitNewCategory() {
    const trimmed = (newCategoryName ?? "").trim();
    if (trimmed) onCreateCategory(trimmed);
    setNewCategoryName(null);
  }

  function submitNewTodo(categoryId: Id) {
    const trimmed = newTodoTitle.trim();
    if (trimmed) {
      onCreateTodo({
        id: `todo-${generateId()}`,
        title: trimmed,
        createdBy: currentMember.id,
        assignedTo: currentMember.id,
        isShared: false,
        status: "pending",
        starValue: 0,
        visual: { type: "lucide-icon", value: "Star" },
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
        personalCategoryId: categoryId
      });
    }
    setAddingTodoInThread(null);
    setNewTodoTitle("");
  }

  return (
    <div className="todo-thread-view">
      {threads.map((thread) => (
        <section key={thread.id} className="todo-thread" aria-label={`Tråd: ${thread.label}`}>
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
                {thread.deletable ? (
                  <button
                    type="button"
                    className="todo-thread__category-button"
                    title="Döp om kategori"
                    onClick={() => {
                      const category = categories.find((c) => c.id === thread.id);
                      if (category) startEditingCategory(category);
                    }}
                  >
                    {thread.label}
                  </button>
                ) : (
                  thread.label
                )}
              </h3>
            )}
            {thread.deletable && (
              <button
                type="button"
                className="icon-button todo-thread__delete-category"
                title="Ta bort kategori"
                onClick={() => onRemoveCategory(thread.id)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {thread.todos.length === 0 ? (
            <p className="todo-thread__empty">Allt avklarat här 🎉</p>
          ) : (
            <ul className="todo-thread__list">
              {thread.todos.map((todo) => {
                const progress = computeProgress(todo);
                const assignee = assigneeNameFor(todo, members);
                const hasSubtasks = (todo.subtasks?.length ?? 0) > 0;
                const isDissolving = dissolving.has(todo.id);
                return (
                  <li key={todo.id} className="todo-thread__item">
                    <button
                      type="button"
                      className={
                        "todo-thread__ball" +
                        (hasSubtasks ? "" : " todo-thread__ball--no-subtasks") +
                        (heldId === todo.id ? " todo-thread__ball--holding" : "") +
                        (isDissolving ? " todo-thread__ball--dissolving" : "")
                      }
                      disabled={isDissolving}
                      onClick={() => handleBallClick(todo, hasSubtasks)}
                      onPointerDown={() => startHold(todo.id, () => handleConfirmComplete(todo))}
                      onPointerUp={clearHold}
                      onPointerLeave={clearHold}
                      onPointerCancel={clearHold}
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
                    <span className="todo-thread__item-assignee" aria-hidden="true">
                      {assignee}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {thread.deletable && (
            <div className="todo-thread__add-todo">
              {addingTodoInThread === thread.id ? (
                <input
                  autoFocus
                  className="todo-thread__category-input"
                  placeholder="Ny uppgift…"
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  onBlur={() => submitNewTodo(thread.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNewTodo(thread.id);
                    if (e.key === "Escape") {
                      setAddingTodoInThread(null);
                      setNewTodoTitle("");
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="icon-button todo-thread__add-todo-button"
                  onClick={() => setAddingTodoInThread(thread.id)}
                >
                  <Plus size={14} /> Lägg till
                </button>
              )}
            </div>
          )}
        </section>
      ))}

      <section className="todo-thread todo-thread--new-category" aria-label="Ny kategori">
        {newCategoryName !== null ? (
          <input
            autoFocus
            className="todo-thread__category-input"
            placeholder="Kategorinamn…"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onBlur={submitNewCategory}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNewCategory();
              if (e.key === "Escape") setNewCategoryName(null);
            }}
          />
        ) : (
          <button
            type="button"
            className="icon-button todo-thread__new-category-button"
            onClick={() => setNewCategoryName("")}
          >
            <Plus size={16} /> Ny kategori
          </button>
        )}
      </section>

      {checklistTodo && (
        <SubtaskChecklistModal
          todo={checklistTodo}
          assigneeName={assigneeNameFor(checklistTodo, members)}
          onToggleSubtask={onToggleSubtask}
          onClose={() => setChecklistTodoId(null)}
        />
      )}
    </div>
  );
}
