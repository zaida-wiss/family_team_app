import "./ParentTodoThreadView.css";
import { useState } from "react";
import { ROUTINE_CATEGORIES } from "@shared/types";
import type { Id, Member, Todo } from "@shared/types";

type Props = {
  todos: Todo[];
  members: Member[];
};

const UNCATEGORIZED = "Övrigt";
const THREAD_ORDER = [...ROUTINE_CATEGORIES, UNCATEGORIZED];

function computeProgress(todo: Todo): number | null {
  if (!todo.subtasks || todo.subtasks.length === 0) return null;
  const done = todo.subtasks.filter((s) => s.done).length;
  return Math.round((done / todo.subtasks.length) * 100);
}

function groupByCategory(todos: Todo[]): Map<string, Todo[]> {
  const groups = new Map<string, Todo[]>(THREAD_ORDER.map((c) => [c, []]));
  for (const todo of todos) {
    const key = todo.routineCategory && groups.has(todo.routineCategory) ? todo.routineCategory : UNCATEGORIZED;
    groups.get(key)!.push(todo);
  }
  return groups;
}

// Föräldravyn med delmoment (Sprint 6 S2) — bollar hängande i en tråd per
// kategori. Tråden töms när uppgifterna görs, tvärtom mot en vanlig lista
// (se discussions/2026-07-04-designspike-medaljer-och-foraldravy.md). Kort
// tryck expanderar delmomenten (läsvänligt än så länge — S3 gör detta till en
// riktig, avbockningsbar checklista-modal). Långt tryck-avklarmarkering (S4)
// är inte kopplad än.
export function ParentTodoThreadView({ todos, members }: Props) {
  const [expandedId, setExpandedId] = useState<Id | null>(null);
  const groups = groupByCategory(todos.filter((t) => t.status === "pending"));

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
                  const assignee = members.find((m) => m.id === todo.assignedTo)?.name ?? "Okänt barn";
                  const isExpanded = expandedId === todo.id;
                  return (
                    <li key={todo.id} className="todo-thread__item">
                      <button
                        type="button"
                        className="todo-thread__ball"
                        onClick={() => setExpandedId(isExpanded ? null : todo.id)}
                        aria-expanded={isExpanded}
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
                      {isExpanded && todo.subtasks && todo.subtasks.length > 0 && (
                        <ul className="todo-thread__subtasks" aria-label={`Delmoment för ${todo.title}`}>
                          {todo.subtasks.map((subtask) => (
                            <li
                              key={subtask.id}
                              className={`todo-thread__subtask${subtask.done ? " todo-thread__subtask--done" : ""}`}
                            >
                              {subtask.title}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
