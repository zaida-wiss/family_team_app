import "./RecurringTodosSettings.css";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Id, Member, RecurrenceUnit, Role, Todo, TodoCategory, TodoTemplate, TodoTemplateTask } from "@shared/types";
import { getVisibleTodos } from "./selectors";
import { isoToDateOnly, isRecurringTemplate, WEEKDAY_SHORT } from "./recurringTodos";
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

const UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: "dag",
  week: "vecka",
  month: "månad",
  year: "år"
};

// Ankardatumets tidsstämpel, för sortering — mallar utan startdatum (borde
// inte förekomma i praktiken, se ADR-0015/incidents/2026-07-06) hamnar sist
// istället för att krascha sorteringen.
function startTimeValue(todo: Todo): number {
  return todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.POSITIVE_INFINITY;
}

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
  onCreateTaskTemplate,
  onDeleteTodo,
  onRefreshRoutine
}: Props) {
  const [editingId, setEditingId] = useState<Id | null>(null);
  // Strukturerad överblick i tidsordning (2026-07-07, Zaidas önskemål) —
  // sorterad på startdatum, tidigast överst, samma princip som tråd-vyns
  // sortByEndThenStartTime.
  const templates = [...getVisibleTodos(currentMember, roles, todos).filter(isRecurringTemplate)]
    .sort((a, b) => startTimeValue(a) - startTimeValue(b));
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
              <strong>
                {todo.visual.value && <span aria-hidden="true">{todo.visual.value} </span>}
                {todo.title}
              </strong>
              <small>
                {describeRecurrence(todo)}
                {todo.visibleFrom && ` · från ${isoToDateOnly(todo.visibleFrom)}`}
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
