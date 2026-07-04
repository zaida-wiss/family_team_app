import "./ParentTodoThreadView.css";
import { useState } from "react";
import { ROUTINE_CATEGORIES } from "@shared/types";
import type { Id, Member, Todo } from "@shared/types";
import { SubtaskChecklistModal } from "./SubtaskChecklistModal";

type Props = {
  todos: Todo[];
  members: Member[];
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
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

function groupByCategory(todos: Todo[]): Map<string, Todo[]> {
  const groups = new Map<string, Todo[]>(THREAD_ORDER.map((c) => [c, []]));
  for (const todo of todos) {
    const key = todo.routineCategory && groups.has(todo.routineCategory) ? todo.routineCategory : UNCATEGORIZED;
    groups.get(key)!.push(todo);
  }
  return groups;
}

// Föräldravyn med delmoment (Sprint 6 S2+S3) — bollar hängande i en tråd per
// kategori. Tråden töms när uppgifterna görs, tvärtom mot en vanlig lista
// (se discussions/2026-07-04-designspike-medaljer-och-foraldravy.md). Kort
// tryck öppnar en avbockningsbar checklista-modal (bara för todos som har
// delmoment). Långt tryck-avklarmarkering (S4) är inte kopplad än.
export function ParentTodoThreadView({ todos, members, onToggleSubtask }: Props) {
  const [checklistTodoId, setChecklistTodoId] = useState<Id | null>(null);
  const groups = groupByCategory(todos.filter((t) => t.status === "pending"));
  const checklistTodo = todos.find((t) => t.id === checklistTodoId) ?? null;

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
                  return (
                    <li key={todo.id} className="todo-thread__item">
                      <button
                        type="button"
                        className="todo-thread__ball"
                        disabled={!hasSubtasks}
                        onClick={() => setChecklistTodoId(todo.id)}
                        aria-label={
                          `${todo.title}, tilldelad ${assignee}` +
                          (progress !== null ? `, ${progress} procent av delmomenten avklarade` : "")
                        }
                      >
                        <span className="todo-thread__ball-title">{todo.title}</span>
                        <span className="todo-thread__ball-assignee">{assignee}</span>
                        {progress !== null && (
                          <span
                            className="todo-thread__ball-progress"
                            style={{ "--progress": `${progress}%` } as React.CSSProperties}
                          >
                            {progress}%
                          </span>
                        )}
                      </button>
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
