import "./TodoDetailModal.css";
import { useState } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import type { Id, RecurrenceRule, Todo, TodoCategory } from "@shared/types";

const NEW_CATEGORY_VALUE = "__new__";
const NO_CATEGORY_VALUE = "__none__";

type Props = {
  todo: Todo;
  assigneeName: string;
  categories: TodoCategory[];
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onClose: () => void;
};

function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateTimeLocalToISO(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function createRecurrence(type: RecurrenceRule["type"]): RecurrenceRule {
  if (type === "weekly") {
    return { type: "weekly", daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"] };
  }
  if (type === "interval") {
    return { type: "interval", every: 1, unit: "week" };
  }
  return { type: "none" };
}

// Uppgifts-detalj-modal (2026-07-05, Zaidas beslut) — ersätter den tidigare
// separata SubtaskChecklistModal helt. Öppnas vid kort tryck på VILKEN boll
// som helst (inte bara de med delmoment): anteckningar, redigera titel/
// kategori/schema/återkommande, och delmomentens avbockningsbara checklista
// visas också här om uppgiften har några.
export function TodoDetailModal({
  todo,
  assigneeName,
  categories,
  onToggleSubtask,
  onUpdateTodo,
  onCreateCategory,
  onClose
}: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const subtasks = todo.subtasks ?? [];
  const doneCount = subtasks.filter((s) => s.done).length;
  const progress = subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0;

  const [title, setTitle] = useState(todo.title);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    todo.personalCategoryId ?? NO_CATEGORY_VALUE
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceRule["type"]>(todo.recurrence.type);
  const [visibleFrom, setVisibleFrom] = useState(isoToDateTimeLocal(todo.visibleFrom));
  const [expiresAt, setExpiresAt] = useState(isoToDateTimeLocal(todo.expiresAt));
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [saving, setSaving] = useState(false);

  const isCreatingCategory = selectedCategoryId === NEW_CATEGORY_VALUE;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;

    setSaving(true);
    try {
      let categoryId: Id | null = selectedCategoryId === NO_CATEGORY_VALUE ? null : selectedCategoryId;
      if (isCreatingCategory) {
        const trimmedName = newCategoryName.trim();
        if (!trimmedName) return;
        const category = await onCreateCategory(trimmedName);
        categoryId = category.id;
      }

      onUpdateTodo(todo.id, {
        title: trimmedTitle,
        personalCategoryId: categoryId,
        recurrence: recurrenceType === todo.recurrence.type ? todo.recurrence : createRecurrence(recurrenceType),
        visibleFrom: dateTimeLocalToISO(visibleFrom),
        expiresAt: dateTimeLocalToISO(expiresAt),
        notes: notes.trim() || null
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

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
            <small className="todo-detail-modal__assignee">{assigneeName}</small>
          </div>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {subtasks.length > 0 && (
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
        )}

        <form className="todo-detail-modal__body" onSubmit={handleSave}>
          <label className="field-label">
            Titel
            <input className="text-input" onChange={(e) => setTitle(e.target.value)} value={title} />
          </label>

          <label className="field-label">
            Kategori
            <select
              className="text-input"
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              value={selectedCategoryId}
            >
              <option value={NO_CATEGORY_VALUE}>Ingen kategori</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value={NEW_CATEGORY_VALUE}>+ Ny kategori…</option>
            </select>
          </label>

          {isCreatingCategory && (
            <label className="field-label">
              Namn på ny kategori
              <input
                autoFocus
                className="text-input"
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Till exempel Träning"
                value={newCategoryName}
              />
            </label>
          )}

          <label className="field-label">
            Återkommer
            <select
              className="text-input"
              onChange={(e) => setRecurrenceType(e.target.value as RecurrenceRule["type"])}
              value={recurrenceType}
            >
              <option value="none">Inte återkommande</option>
              <option value="weekly">Veckovis vardagar</option>
              <option value="interval">Varje vecka</option>
            </select>
          </label>

          <label className="field-label">
            Syns från
            <input
              className="text-input"
              onChange={(e) => setVisibleFrom(e.target.value)}
              type="datetime-local"
              value={visibleFrom}
            />
          </label>

          <label className="field-label">
            Försvinner
            <input
              className="text-input"
              onChange={(e) => setExpiresAt(e.target.value)}
              type="datetime-local"
              value={expiresAt}
            />
          </label>

          <label className="field-label">
            Anteckningar
            <textarea
              className="text-input"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valfritt"
              rows={3}
              value={notes}
            />
          </label>

          <button className="primary-button" disabled={saving} type="submit">
            Spara
          </button>
        </form>
      </div>
    </div>
  );
}
