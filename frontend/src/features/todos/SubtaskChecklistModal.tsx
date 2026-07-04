import "./SubtaskChecklistModal.css";
import { X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import type { Id, Todo } from "@shared/types";

type Props = {
  todo: Todo;
  assigneeName: string;
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onClose: () => void;
};

export function SubtaskChecklistModal({ todo, assigneeName, onToggleSubtask, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const subtasks = todo.subtasks ?? [];
  const doneCount = subtasks.filter((s) => s.done).length;
  const progress = subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0;

  return (
    <div className="subtask-checklist-overlay" onClick={onClose}>
      <div
        aria-labelledby="subtask-checklist-title"
        aria-modal="true"
        className="subtask-checklist-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="subtask-checklist-modal__hdr">
          <div>
            <span id="subtask-checklist-title">{todo.title}</span>
            <small className="subtask-checklist-modal__assignee">{assigneeName}</small>
          </div>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="subtask-checklist-modal__progress">
          <div
            className="subtask-checklist-modal__progress-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Andel avklarade delmoment"
          >
            <div className="subtask-checklist-modal__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="subtask-checklist-modal__progress-label">{progress}% klart</span>
        </div>

        <ul className="subtask-checklist-modal__list">
          {subtasks.map((subtask) => (
            <li key={subtask.id}>
              <label className="subtask-checklist-modal__item">
                <input
                  checked={subtask.done}
                  onChange={() => onToggleSubtask(todo.id, subtask.id)}
                  type="checkbox"
                />
                <span className={subtask.done ? "subtask-checklist-modal__item-title--done" : ""}>
                  {subtask.title}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
