import "./TodoDetailModal.css";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { useModalA11y } from "../../hooks/useModalA11y";
import { isRecurrenceIncomplete, RecurrencePicker } from "./RecurrencePicker";
import { TimeWindowsPicker } from "./TimeWindowsPicker";
import { dateOnlyToISO, isoToDateOnly } from "./recurringTodos";
import { isChildMember } from "./selectors";
import { generateId } from "../../utils/uuid";
import type { Id, Member, RecurrenceRule, Role, Todo, TodoCategory, TodoSubtask, TodoTimeWindow } from "@shared/types";

const NEW_CATEGORY_VALUE = "__new__";
const NO_CATEGORY_VALUE = "__none__";
// Autospara (2026-07-08, Zaidas önskemål: "jag vill inte behöva trycka på
// spara... det skall sparas ändå när jag skriver") — väntar ut en kort paus i
// skrivandet innan ändringen skickas, istället för att spara vid VARJE
// tangenttryckning.
const AUTOSAVE_DEBOUNCE_MS = 700;
const SAVED_INDICATOR_MS = 1500;

type Props = {
  todo: Todo;
  members: Member[];
  roles: Role[];
  categories: TodoCategory[];
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onDeleteTodo: (todoId: Id) => void;
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
  members,
  roles,
  categories,
  onUpdateTodo,
  onCreateCategory,
  onDeleteTodo,
  onClose
}: Props) {
  function handleDelete() {
    onDeleteTodo(todo.id);
    onClose();
  }

  // Mottagaren kan inte bytas i redigera-läget (bara i skapa-modalen) — men
  // stjärnfältet ska ändå vara exakt samma som där (2026-07-07, Zaidas fynd:
  // fältet saknades helt vid redigering) när uppgiften är tilldelad ett barn.
  const isForChild = isChildMember(members.find((m) => m.id === todo.assignedTo), roles);
  // En genererad daglig occurrence (recurringSourceId satt) bär aldrig med sig
  // mallens återkommelseregel — dess EGNA recurrence är alltid "none", en
  // frusen engångskopia för just idag (recurringTodos.ts). RecurrencePicker
  // visades ändå här och kunde ställas om till "Återkommande" utan att göra
  // något meningsfullt (isRecurringTemplate kräver recurringSourceId===null,
  // så occurrencen kan aldrig bli sin egen mall) — bara förvirrande (Zaida,
  // 2026-07-08: bollens redigering visade "inte återkommande" trots att
  // Inställningar → Återkommande uppgifter visade samma uppgift som
  // återkommande). Väljaren döljs nu helt för en occurrence, till förmån för
  // en hänvisning till var serien faktiskt redigeras.
  const isGeneratedOccurrence = todo.recurringSourceId !== null;

  const [title, setTitle] = useState(todo.title);
  const [emoji, setEmoji] = useState(todo.visual.value);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    todo.personalCategoryId ?? NO_CATEGORY_VALUE
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  // Sträng, inte tal (2026-07-07-fix) — se samma resonemang i TodoCreatorModal.tsx.
  const [starValueInput, setStarValueInput] = useState(String(todo.starValue));
  const starValue = Math.max(0, Math.floor(Number(starValueInput)) || 0);
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
  const [timerEnabled, setTimerEnabled] = useState(todo.timerEnabled ?? false);
  const [plannedDurationMinutesInput, setPlannedDurationMinutesInput] = useState(
    todo.plannedDurationMinutes ? String(todo.plannedDurationMinutes) : ""
  );
  // "Uppdaterat"-bekräftelsen (2026-07-08, Zaidas önskemål) — kort, tyst
  // bekräftelse istället för en Spara-knapp att trycka på.
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: generateId(), title: "", done: false }]);
  }

  function updateSubtaskTitle(id: Id, title: string) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  function removeSubtask(id: Id) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  // Flytta ett delmoment upp/ner i listan (2026-07-08, Zaidas önskemål:
  // "jag behöver kunna flytta ordningen på delmomenten") — enkla pil-knappar
  // istället för drag-and-drop, samma touch-/tangentbordsvänliga mönster som
  // resten av appen använder för listor med få rader.
  function moveSubtask(id: Id, direction: -1 | 1) {
    setSubtasks((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  const isCreatingCategory = selectedCategoryId === NEW_CATEGORY_VALUE;
  const isTitleMissing = title.trim().length === 0;
  // Se samma resonemang i TodoCreatorModal.tsx — utan startdatum tappar en
  // återkommande mall sitt ankardatum (grundorsaken till incidenten
  // 2026-07-06, se incidents/2026-07-06-barnens-rutiner-forsvann.md).
  const isStartDateMissing = recurrence.type !== "none" && !startDate;
  // Se samma resonemang i TodoCreatorModal.tsx.
  const isEndBeforeStart =
    recurrence.type === "none" && !!visibleFrom && !!expiresAt && expiresAt < visibleFrom;
  const canSubmit = !isTitleMissing && !isStartDateMissing && !isEndBeforeStart && !isRecurrenceIncomplete(recurrence);

  function handleVisibleFromChange(value: string) {
    setVisibleFrom(value);
    if (!expiresAt) {
      setExpiresAt(value);
    }
  }

  // performSave/scheduleAutosave hålls i refs så den alltid kör med FÄRSKA
  // state-värden (undviker stale closures i den debounce-timeout som skapas
  // en gång per render, se useEffect nedan).
  const performSaveRef = useRef<() => Promise<void>>(async () => {});
  performSaveRef.current = async () => {
    if (!canSubmit) return;

    let categoryId: Id | null = selectedCategoryId === NO_CATEGORY_VALUE ? null : selectedCategoryId;
    if (isCreatingCategory) {
      const trimmedName = newCategoryName.trim();
      if (!trimmedName) return;
      const category = await onCreateCategory(trimmedName);
      categoryId = category.id;
      // Undviker att skapa ännu en kategori nästa gång autospara triggas av en
      // orelaterad ändring — pekar om valet mot den nyss skapade kategorin.
      setSelectedCategoryId(category.id);
    }

    const isRecurring = recurrence.type !== "none";
    onUpdateTodo(todo.id, {
      title: title.trim(),
      visual: { type: "lucide-icon", value: emoji },
      personalCategoryId: categoryId,
      ...(isForChild
        ? {
            starValue,
            timerEnabled,
            plannedDurationMinutes:
              timerEnabled && plannedDurationMinutesInput
                ? Math.max(1, Math.min(480, Math.floor(Number(plannedDurationMinutesInput)) || 1))
                : null
          }
        : {}),
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
    setSaveStatus("saved");
  };

  const saveTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const savedIndicatorTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    // Första körningen är bara state satt från den befintliga todon — inget
    // att spara än.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = null;
      void performSaveRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title, emoji, selectedCategoryId, newCategoryName, starValueInput, timerEnabled,
    plannedDurationMinutesInput, recurrence, visibleFrom, expiresAt, startDate, timeWindows,
    notes, subtasks
  ]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    if (savedIndicatorTimeoutRef.current !== null) window.clearTimeout(savedIndicatorTimeoutRef.current);
    savedIndicatorTimeoutRef.current = window.setTimeout(() => setSaveStatus("idle"), SAVED_INDICATOR_MS);
    return () => {
      if (savedIndicatorTimeoutRef.current !== null) window.clearTimeout(savedIndicatorTimeoutRef.current);
    };
  }, [saveStatus]);

  // Stänger man direkt efter att ha skrivit klart (innan debounce-fönstret
  // hinner löpa ut) ska den sista ändringen ändå inte tappas bort.
  function handleClose() {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      void performSaveRef.current();
    }
    onClose();
  }

  const dialogRef = useModalA11y<HTMLDivElement>(handleClose);

  return (
    <div className="todo-detail-overlay" onClick={handleClose}>
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
          <span aria-live="polite" className="todo-edit-modal__save-status">
            {saveStatus === "saved" ? "Uppdaterat ✓" : ""}
          </span>
          <button aria-label="Stäng" className="icon-button" onClick={handleClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="todo-detail-modal__body">
          <div className="todo-emoji-title-row">
            <EmojiPickerPortal symbol={emoji} onSelect={setEmoji} triggerClassName="todo-emoji-btn" />
            <label className="field-label todo-emoji-title-row__title">
              Titel
              <input className="text-input" onChange={(e) => setTitle(e.target.value)} value={title} />
            </label>
          </div>
          {isTitleMissing && <p className="field-hint">Titel krävs.</p>}

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

          {isForChild && (
            <label className="field-label">
              Stjärnor
              <input
                className="text-input"
                min={0}
                onChange={(e) => setStarValueInput(e.target.value)}
                type="number"
                value={starValueInput}
              />
            </label>
          )}

          {isForChild && (
            <label className="todo-timer-toggle">
              <input
                checked={timerEnabled}
                onChange={(e) => setTimerEnabled(e.target.checked)}
                type="checkbox"
              />
              Använd en timer för uppgiften
            </label>
          )}

          {isForChild && timerEnabled && (
            <label className="field-label">
              Planerad tid (minuter)
              <input
                className="text-input"
                min={1}
                max={480}
                onChange={(e) => setPlannedDurationMinutesInput(e.target.value)}
                placeholder="T.ex. 10"
                type="number"
                value={plannedDurationMinutesInput}
              />
              <span className="field-hint field-hint--neutral">
                Barnet dubbelklickar för att starta nedräkningen. Lämnas det tomt visas en vanlig tidtagning istället.
              </span>
            </label>
          )}

          {isGeneratedOccurrence ? (
            <p className="field-hint field-hint--neutral">
              Del av en återkommande serie — ändra hela serien via Inställningar → 🔁 Återkommande uppgifter.
            </p>
          ) : (
            <RecurrencePicker onChange={setRecurrence} value={recurrence} />
          )}

          {recurrence.type === "none" ? (
            <>
              <label className="field-label">
                Syns från
                <input
                  className="text-input"
                  onChange={(e) => handleVisibleFromChange(e.target.value)}
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
              {isEndBeforeStart && <p className="field-hint">Försvinner kan inte vara tidigare än Syns från.</p>}
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
              {isStartDateMissing && <p className="field-hint">Välj ett startdatum.</p>}

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
              {subtasks.map((subtask, index) => (
                <li key={subtask.id} className="todo-edit-modal__subtask-row">
                  <input
                    aria-label="Delmomentets titel"
                    className="text-input"
                    onChange={(e) => updateSubtaskTitle(subtask.id, e.target.value)}
                    placeholder="Till exempel Uppvärmning"
                    value={subtask.title}
                  />
                  <button
                    aria-label="Flytta delmoment upp"
                    className="icon-button"
                    disabled={index === 0}
                    onClick={() => moveSubtask(subtask.id, -1)}
                    type="button"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    aria-label="Flytta delmoment ner"
                    className="icon-button"
                    disabled={index === subtasks.length - 1}
                    onClick={() => moveSubtask(subtask.id, 1)}
                    type="button"
                  >
                    <ChevronDown size={16} />
                  </button>
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

          <div className="todo-edit-modal__actions">
            <button className="danger-button" onClick={handleDelete} type="button">
              <Trash2 size={15} />
              Radera
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
