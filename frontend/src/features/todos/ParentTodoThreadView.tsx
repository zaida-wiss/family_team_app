import "./ParentTodoThreadView.css";
import { useEffect, useRef, useState } from "react";
import { ROUTINE_CATEGORIES } from "@shared/types";
import type { Id, Member, Todo } from "@shared/types";
import { SubtaskChecklistModal } from "./SubtaskChecklistModal";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";

const HOLD_DURATION_MS = 2000;
// Måste matcha CSS-animationens längd (todo-thread-dissolve i .css) — bollen
// hålls kvar i DOM:en så länge, tonad med --dissolving-klassen, innan den
// faktiskt tas bort ur listan.
const DISSOLVE_DURATION_MS = 500;

type Props = {
  todos: Todo[];
  members: Member[];
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onCompleteTodo: (todoId: Id) => void;
};

const UNCATEGORIZED = "Övrigt";
const THREAD_ORDER = [...ROUTINE_CATEGORIES, UNCATEGORIZED];

function computeProgress(todo: Todo): number | null {
  if (!todo.subtasks || todo.subtasks.length === 0) return null;
  const done = todo.subtasks.filter((s) => s.done).length;
  return Math.round((done / todo.subtasks.length) * 100);
}

function assigneeNameFor(todo: Todo, members: Member[]): string {
  return members.find((m) => m.id === todo.assignedTo)?.name ?? "Okänt barn";
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

function groupByCategory(todos: Todo[]): Map<string, Todo[]> {
  const groups = new Map<string, Todo[]>(THREAD_ORDER.map((c) => [c, []]));
  for (const todo of todos) {
    const key = todo.routineCategory && groups.has(todo.routineCategory) ? todo.routineCategory : UNCATEGORIZED;
    groups.get(key)!.push(todo);
  }
  for (const [category, categoryTodos] of groups) {
    groups.set(category, sortByEndThenStartTime(categoryTodos));
  }
  return groups;
}

// Föräldravyn med delmoment (Sprint 6 S2–S4, förfinad 2026-07-05) — runda
// bollar hängande i en tråd (vertikal linje) rakt ner från kategorirubriken,
// sorterade på sluttid (expiresAt) och sedan starttid (visibleFrom) som andra
// sortering. Tråden töms när uppgifterna görs, tvärtom mot en vanlig lista
// (se discussions/2026-07-04-designspike-medaljer-och-foraldravy.md). Kort
// tryck öppnar en avbockningsbar checklista-modal (bara för todos som har
// delmoment). Långt tryck (2s, useHoldToConfirm — samma mekanism som barnens
// egen avklarmarkering, se ADR-diskussion 2026-07-05) markerar hela uppgiften
// klar oavsett delmoment-status — bollen "går upp i rök" (tonas/skalas bort)
// istället för att bara försvinna direkt.
export function ParentTodoThreadView({ todos, members, onToggleSubtask, onCompleteTodo }: Props) {
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
  const groups = groupByCategory(visibleTodos);
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

  return (
    <div className="todo-thread-view">
      {THREAD_ORDER.map((category) => {
        const categoryTodos = groups.get(category) ?? [];
        return (
          <section key={category} className="todo-thread" aria-label={`Tråd: ${category}`}>
            <h3 className="todo-thread__category">{category}</h3>
            {categoryTodos.length === 0 ? (
              <p className="todo-thread__empty">Allt avklarat här 🎉</p>
            ) : (
              <ul className="todo-thread__list">
                {categoryTodos.map((todo) => {
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
          </section>
        );
      })}

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
