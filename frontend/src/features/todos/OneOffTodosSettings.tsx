import "./OneOffTodosSettings.css";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Id, Member, Role, Todo, TodoCategory, TodoTemplate, TodoTemplateTask } from "@shared/types";
import { fmtFullDate, fmtTime } from "../calendars/calendarHelpers";
import { getAssigneeName, getVisibleTodos, isOneOffTodo } from "./selectors";
import { TodoEditModal } from "./TodoEditModal";

type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  categories: TodoCategory[];
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onCreateTaskTemplate: (task: TodoTemplateTask) => Promise<TodoTemplate>;
  onDeleteTodo: (todoId: Id) => void;
  onRefreshRoutine: (routineId: Id) => void;
};

function startTimeValue(todo: Todo): number {
  return todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.POSITIVE_INFINITY;
}

function describeSchedule(todo: Todo): string | null {
  if (!todo.visibleFrom && !todo.expiresAt) return null;
  if (todo.visibleFrom && todo.expiresAt) {
    return `${fmtFullDate(todo.visibleFrom)} · ${fmtTime(todo.visibleFrom)}–${fmtTime(todo.expiresAt)}`;
  }
  if (todo.visibleFrom) return `Syns från ${fmtFullDate(todo.visibleFrom)} ${fmtTime(todo.visibleFrom)}`;
  return `Försvinner ${fmtFullDate(todo.expiresAt as string)} ${fmtTime(todo.expiresAt as string)}`;
}

// Engångsuppgifter i Inställningar (2026-07-08, Zaidas önskemål) — motsvarande
// hanteringsyta som Återkommande uppgifter, men för uppgifter UTAN
// återkommelse. Behövs eftersom en aktiv engångsuppgift annars bara går att
// hitta i tråd-vyn/listläget (kräver att man vet vilken kategori den ligger
// i) — den här listan samlar alla på ett ställe, oavsett kategori.
export function OneOffTodosSettings({
  currentMember,
  members,
  roles,
  todos,
  categories,
  onUpdateTodo,
  onCreateCategory,
  onCreateTaskTemplate,
  onDeleteTodo,
  onRefreshRoutine
}: Props) {
  const [editingId, setEditingId] = useState<Id | null>(null);
  const oneOffTodos = [...getVisibleTodos(currentMember, roles, todos).filter(isOneOffTodo)]
    .sort((a, b) => startTimeValue(a) - startTimeValue(b));
  const editingTodo = oneOffTodos.find((t) => t.id === editingId) ?? null;

  if (oneOffTodos.length === 0) {
    return <p className="empty-note">Inga engångsuppgifter ännu.</p>;
  }

  return (
    <>
      <ul className="one-off-todos-settings__list">
        {oneOffTodos.map((todo) => {
          const schedule = describeSchedule(todo);
          const assignee = getAssigneeName(todo, members);
          return (
            <li className="one-off-todos-settings__row" key={todo.id}>
              <div className="one-off-todos-settings__info">
                <strong>
                  {todo.visual.value && <span aria-hidden="true">{todo.visual.value} </span>}
                  {todo.title}
                </strong>
                <small>
                  {todo.assignedTo !== currentMember.id && `${assignee} · `}
                  {schedule ?? "Inget schema"}
                </small>
              </div>
              <button
                aria-label={`Redigera ${todo.title}`}
                className="icon-button"
                onClick={() => setEditingId(todo.id)}
                title="Redigera"
                type="button"
              >
                <Pencil size={16} />
              </button>
              <button
                aria-label={`Ta bort ${todo.title}`}
                className="icon-button danger"
                onClick={() => onDeleteTodo(todo.id)}
                title="Ta bort"
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </li>
          );
        })}
      </ul>

      {editingTodo && (
        <TodoEditModal
          currentMember={currentMember}
          members={members}
          roles={roles}
          categories={categories}
          todos={todos}
          onCreateCategory={onCreateCategory}
          onCreateTaskTemplate={onCreateTaskTemplate}
          onDeleteTodo={onDeleteTodo}
          onRefreshRoutine={onRefreshRoutine}
          onClose={() => setEditingId(null)}
          onUpdateTodo={onUpdateTodo}
          todo={editingTodo}
        />
      )}
    </>
  );
}
