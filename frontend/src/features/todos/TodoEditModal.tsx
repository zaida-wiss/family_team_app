import "./TodoDetailModal.css";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import { isRecurrenceIncomplete, RecurrencePicker } from "./RecurrencePicker";
import { TimeWindowsPicker } from "./TimeWindowsPicker";
import { dateOnlyToISO, isoToDateOnly } from "./recurringTodos";
import { generateId } from "../../utils/uuid";
import type { Id, RecurrenceRule, Todo, TodoCategory, TodoSubtask, TodoTimeWindow } from "@shared/types";

const NEW_CATEGORY_VALUE = "__new__";
const NO_CATEGORY_VALUE = "__none__";

type Props = {
  todo: Todo;
  categories: TodoCategory[];
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

// Uppgifts-redigera-modal (2026-07-05, Zaidas beslut) — utbruten ur den
// tidigare kombinerade TodoDetailModal. Öppnas via pennikonen i
// TodoDetailView, inte direkt vid klick på bollen (samma mönster som
// kalenderns CalendarEventDetail → CalendarEventModal).
export function TodoEditModal({
  todo,
  categories,
  onUpdateTodo,
  onCreateCategory,
  onClose
}: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const [title, setTitle] = useState(todo.title);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    todo.personalCategoryId ?? NO_CATEGORY_VALUE
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceRule>(todo.recurrence);
  const [visibleFrom, setVisibleFrom] = useState(isoToDateTimeLocal(todo.visibleFrom));
  const [expiresAt, setExpiresAt] = useState(isoToDateTimeLocal(todo.expiresAt));
  const [startDate, setStartDate] = useState(isoToDateOnly(todo.visibleFrom));
  const [timeWindows, setTimeWindows] = useState<TodoTimeWindow[]>(
    todo.timeWindows && todo.timeWindows.length > 0
      ? todo.timeWindows
      : [{ visibleFrom: todo.visibleFrom, expiresAt: todo.expiresAt }]
  );
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>(todo.subtasks ?? []);
  const [saving, setSaving] = useState(false);

  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: generateId(), title: "", done: false }]);
  }

  function updateSubtaskTitle(id: Id, title: string) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  function removeSubtask(id: Id) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  const isCreatingCategory = selectedCategoryId === NEW_CATEGORY_VALUE;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving || isRecurrenceIncomplete(recurrence)) return;

    setSaving(true);
    try {
      let categoryId: Id | null = selectedCategoryId === NO_CATEGORY_VALUE ? null : selectedCategoryId;
      if (isCreatingCategory) {
        const trimmedName = newCategoryName.trim();
        if (!trimmedName) return;
        const category = await onCreateCategory(trimmedName);
        categoryId = category.id;
      }

      const isRecurring = recurrence.type !== "none";
      onUpdateTodo(todo.id, {
        title: trimmedTitle,
        personalCategoryId: categoryId,
        recurrence,
        // Återkommande: visibleFrom är bara ankardatumet för förfallo-
        // beräkningen (recurringTodos.ts), de faktiska klockslagen kommer från
        // timeWindows. Engångsuppgift: visibleFrom/expiresAt är en fullständig
        // datum+tid som tidigare, timeWindows nollställs (annars kvarstår den
        // dött om uppgiften senare blir återkommande igen utan att fyllas i).
        visibleFrom: isRecurring ? dateOnlyToISO(startDate) : dateTimeLocalToISO(visibleFrom),
        expiresAt: isRecurring ? todo.expiresAt : dateTimeLocalToISO(expiresAt),
        timeWindows: isRecurring ? timeWindows : [],
        notes: notes.trim() || null,
        subtasks: subtasks
          .map((s) => ({ ...s, title: s.title.trim() }))
          .filter((s) => s.title.length > 0)
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="todo-detail-overlay" onClick={onClose}>
      <div
        aria-labelledby="todo-edit-title"
        aria-modal="true"
        className="todo-detail-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="todo-detail-modal__hdr">
          <span id="todo-edit-title">Redigera uppgift</span>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

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

          <RecurrencePicker onChange={setRecurrence} value={recurrence} />

          {recurrence.type === "none" ? (
            <>
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
            </>
          ) : (
            <>
              <label className="field-label">
                Startdatum
                <input
                  className="text-input"
                  onChange={(e) => setStartDate(e.target.value)}
                  type="date"
                  value={startDate}
                />
              </label>

              <TimeWindowsPicker onChange={setTimeWindows} windows={timeWindows} />
            </>
          )}

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

          <div className="field-label">
            <span>Delmoment (egen checklista)</span>
            <ul className="todo-edit-modal__subtasks">
              {subtasks.map((subtask) => (
                <li key={subtask.id} className="todo-edit-modal__subtask-row">
                  <input
                    aria-label="Delmomentets titel"
                    className="text-input"
                    onChange={(e) => updateSubtaskTitle(subtask.id, e.target.value)}
                    placeholder="Till exempel Uppvärmning"
                    value={subtask.title}
                  />
                  <button
                    aria-label="Ta bort delmoment"
                    className="icon-button"
                    onClick={() => removeSubtask(subtask.id)}
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <button className="secondary-button" onClick={addSubtask} type="button">
              <Plus size={14} />
              Lägg till delmoment
            </button>
          </div>

          <button className="primary-button" disabled={saving || isRecurrenceIncomplete(recurrence)} type="submit">
            Spara
          </button>
        </form>
      </div>
    </div>
  );
}
