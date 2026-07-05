import "./TodoDetailModal.css";
import { Pencil, X } from "lucide-react";
import { Fragment } from "react";
import { fmtFullDate, fmtTime } from "../calendars/calendarHelpers";
import { useModalA11y } from "../../hooks/useModalA11y";
import type { Id, RecurrenceUnit, Todo } from "@shared/types";
import { WEEKDAY_SHORT } from "./recurringTodos";

type Props = {
  todo: Todo;
  assigneeName: string;
  assigneeColor?: string;
  categoryName: string | null;
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onClose: () => void;
  onEdit: () => void;
};

function formatSchedule(todo: Todo): string | null {
  if (!todo.visibleFrom && !todo.expiresAt) return null;
  if (todo.visibleFrom && todo.expiresAt) {
    return `${fmtFullDate(todo.visibleFrom)} · ${fmtTime(todo.visibleFrom)}–${fmtTime(todo.expiresAt)}`;
  }
  if (todo.visibleFrom) return `Syns från ${fmtFullDate(todo.visibleFrom)} ${fmtTime(todo.visibleFrom)}`;
  return `Försvinner ${fmtFullDate(todo.expiresAt as string)} ${fmtTime(todo.expiresAt as string)}`;
}

const UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: "dag",
  week: "vecka",
  month: "månad"
};

function formatRecurrence(todo: Todo): string | null {
  const recurrence = todo.recurrence;
  if (recurrence.type === "none") return null;

  const unitLabel = UNIT_LABEL[recurrence.unit];
  const everyLabel = recurrence.every === 1 ? `Varje ${unitLabel}` : `Var ${recurrence.every}:e ${unitLabel}`;

  if (recurrence.unit === "week" && recurrence.daysOfWeek) {
    return `${everyLabel}: ${recurrence.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(", ")}`;
  }
  return everyLabel;
}

// Uppgifts-visa-modal (2026-07-05, Zaidas beslut) — ersätter den tidigare
// kombinerade TodoDetailModal. Läsbar info om uppgiften (som kalenderns
// CalendarEventDetail), INTE en redigeringsformulär. Delmomentens checklista
// är fortsatt interaktiv här — att bocka av ett delmoment är att utföra
// uppgiften, inte att redigera dess definition. En liten pennikon öppnar
// TodoEditModal för att ändra titel/kategori/schema/återkommande/anteckningar.
export function TodoDetailView({
  todo,
  assigneeName,
  assigneeColor,
  categoryName,
  onToggleSubtask,
  onClose,
  onEdit
}: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const subtasks = todo.subtasks ?? [];
  const doneCount = subtasks.filter((s) => s.done).length;
  const progress = subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0;
  const schedule = formatSchedule(todo);
  const recurrence = formatRecurrence(todo);

  return (
    <div className="todo-detail-overlay" onClick={onClose}>
      <div
        aria-labelledby="todo-detail-title"
        aria-modal="true"
        className="todo-detail-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="todo-detail-modal__hdr">
          <div>
            <span id="todo-detail-title">{todo.title}</span>
            <small className="todo-detail-modal__assignee" style={assigneeColor ? { color: assigneeColor } : undefined}>
              {assigneeName}
            </small>
          </div>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="todo-detail-modal__section">
          <h4 className="todo-detail-modal__section-title">Delmoment</h4>
          {subtasks.length > 0 ? (
            <>
              <div className="todo-detail-modal__progress">
                <div
                  className="todo-detail-modal__progress-bar"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Andel avklarade delmoment"
                >
                  <div className="todo-detail-modal__progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="todo-detail-modal__progress-label">{progress}% klart</span>
              </div>

              <ul className="todo-detail-modal__checklist">
                {subtasks.map((subtask) => (
                  <li key={subtask.id}>
                    <label className="todo-detail-modal__checklist-item">
                      <input
                        checked={subtask.done}
                        onChange={() => onToggleSubtask(todo.id, subtask.id)}
                        type="checkbox"
                      />
                      <span className={subtask.done ? "todo-detail-modal__checklist-item-title--done" : ""}>
                        {subtask.title}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="todo-detail-modal__empty-hint">Inga delmoment ännu.</p>
          )}
        </div>

        <div className="todo-detail-modal__body todo-detail-modal__body--view">
          {(categoryName || schedule || recurrence) && (
            <p className="todo-detail-modal__meta">
              {[categoryName, schedule, recurrence].filter(Boolean).map((line, i, arr) => (
                <Fragment key={line}>
                  {line}
                  {i < arr.length - 1 && <br />}
                </Fragment>
              ))}
            </p>
          )}

          <div className="todo-detail-modal__section">
            <h4 className="todo-detail-modal__section-title">Anteckningar</h4>
            {todo.notes ? (
              <p className="todo-detail-modal__notes">{todo.notes}</p>
            ) : (
              <p className="todo-detail-modal__empty-hint">Inga anteckningar ännu.</p>
            )}
          </div>

          <button className="primary-button" onClick={onEdit} type="button">
            <Pencil size={16} />
            Redigera uppgift
          </button>
        </div>
      </div>
    </div>
  );
}
