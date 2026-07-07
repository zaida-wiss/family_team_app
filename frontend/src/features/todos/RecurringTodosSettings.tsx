import "./RecurringTodosSettings.css";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Id, Member, RecurrenceUnit, Role, Todo, TodoCategory } from "@shared/types";
import { getVisibleTodos } from "./selectors";
import { isRecurringTemplate, WEEKDAY_SHORT } from "./recurringTodos";
import { TodoEditModal } from "./TodoEditModal";

type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  categories: TodoCategory[];
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onDeleteTodo: (todoId: Id) => void;
};

const UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: "dag",
  week: "vecka",
  month: "månad",
  year: "år"
};

function describeRecurrence(todo: Todo): string {
  const recurrence = todo.recurrence;
  if (recurrence.type !== "recurring") return "";
  const unitLabel = UNIT_LABEL[recurrence.unit];
  const everyLabel = recurrence.every === 1 ? `Varje ${unitLabel}` : `Var ${recurrence.every}:e ${unitLabel}`;
  if (recurrence.unit === "week" && recurrence.daysOfWeek) {
    return `${everyLabel}: ${recurrence.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(", ")}`;
  }
  return everyLabel;
}

// De återkommande MALLARNA (recurringSourceId===null) visas inte längre som
// vanliga bollar/rader i Todos-panelen (2026-07-06) — de tävlade om
// uppmärksamhet med sin egen dagliga occurrence och såg ut som en dubblett
// (Zaida). Mallen är dock fortfarande det enda stället där man kan ändra
// återkommelsemönstret eller stoppa en serie helt, så den behöver en egen,
// separat hanteringsyta i Inställningar istället för att bara försvinna.
export function RecurringTodosSettings({
  currentMember,
  members,
  roles,
  todos,
  categories,
  onUpdateTodo,
  onCreateCategory,
  onDeleteTodo
}: Props) {
  const [editingId, setEditingId] = useState<Id | null>(null);
  const templates = getVisibleTodos(currentMember, roles, todos).filter(isRecurringTemplate);
  const editingTodo = templates.find((t) => t.id === editingId) ?? null;

  if (templates.length === 0) {
    return <p className="empty-note">Inga återkommande uppgifter ännu.</p>;
  }

  return (
    <>
      <ul className="recurring-todos-settings__list">
        {templates.map((todo) => (
          <li className="recurring-todos-settings__row" key={todo.id}>
            <div className="recurring-todos-settings__info">
              <strong>{todo.title}</strong>
              <small>{describeRecurrence(todo)}</small>
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
              aria-label={`Ta bort serien ${todo.title}`}
              className="icon-button danger"
              onClick={() => onDeleteTodo(todo.id)}
              title="Ta bort serien"
              type="button"
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>

      {editingTodo && (
        <TodoEditModal
          members={members}
          roles={roles}
          categories={categories}
          onCreateCategory={onCreateCategory}
          onDeleteTodo={onDeleteTodo}
          onClose={() => setEditingId(null)}
          onUpdateTodo={onUpdateTodo}
          todo={editingTodo}
        />
      )}
    </>
  );
}
