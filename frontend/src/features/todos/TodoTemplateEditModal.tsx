import "./ParentTodoThreadView.css";
import "./TodoTemplateEditModal.css";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Info, Plus, Trash2, X } from "lucide-react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { useModalA11y } from "../../hooks/useModalA11y";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";
import { isRecurrenceIncomplete, RecurrencePicker } from "./RecurrencePicker";
import { generateId } from "../../utils/uuid";
import type { Id, RecurrenceRule, TodoTemplate, TodoTemplateTask } from "@shared/types";

type DraftSubtask = { key: Id; title: string; timedMinutes: number | null };

type Props = {
  template: TodoTemplate;
  onUpdate: (id: Id, task: TodoTemplateTask) => Promise<unknown>;
  onClose: () => void;
};

// Full fältredigering av en fristående uppgiftsmall (2026-08-06, Zaidas
// fråga: "Går alla fält från mallen att redigera i modalerna? Tidtagning
// text? antal minuter?") — ersätter TemplatesSettings.tsx:s tidigare
// namnbyte-bara inline-redigering. Backend-endpointen tog redan emot en
// FULL TodoTemplateTask (bara aldrig anropad med mer än titeln ändrad, se
// useTodoTemplatesState.ts:s tidigare renameTaskTemplate). Explicit
// Spara-knapp, INTE TodoEditModal.tsx:s autosave — det mönstret var
// medvetet begränsat till just den modalen (Zaidas val 2026-07-08).
export function TodoTemplateEditModal({ template, onUpdate, onClose }: Props) {
  const [title, setTitle] = useState(template.title);
  const [emoji, setEmoji] = useState(template.visual.value);
  const [notes, setNotes] = useState(template.notes ?? "");
  const [starValueInput, setStarValueInput] = useState(String(template.starValue));
  const [timerEnabled, setTimerEnabled] = useState(template.timerEnabled ?? false);
  const [plannedDurationMinutesInput, setPlannedDurationMinutesInput] = useState(
    template.plannedDurationMinutes ? String(template.plannedDurationMinutes) : ""
  );
  // Auto-stopp (2026-08-15) — samma fält som TodoCreatorModal.tsx/
  // TodoEditModal.tsx, kvarglömt här sedan den här modalen byggdes
  // 2026-08-06 (två dagar innan fältet ens fanns).
  const [timerMaxMinutesInput, setTimerMaxMinutesInput] = useState(
    template.timerMaxMinutes ? String(template.timerMaxMinutes) : ""
  );
  const [recurrence, setRecurrence] = useState<RecurrenceRule>(template.recurrence);
  const [subtasks, setSubtasks] = useState<DraftSubtask[]>(
    template.subtasks.map((s) => ({ key: generateId(), title: s.title, timedMinutes: s.timedMinutes ?? null }))
  );
  const [showInfo, setShowInfo] = useState(false);
  const [saving, setSaving] = useState(false);

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const overlay = useOverlayDismiss(onClose);
  const infoOverlay = useOverlayDismiss(() => setShowInfo(false));

  const subtaskInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFocusIndexRef = useRef<number | null>(null);
  useEffect(() => {
    const index = pendingFocusIndexRef.current;
    if (index !== null) {
      subtaskInputRefs.current[index]?.focus();
      pendingFocusIndexRef.current = null;
    }
  }, [subtasks.length]);

  function addSubtask() {
    setSubtasks((prev) => [...prev, { key: generateId(), title: "", timedMinutes: null }]);
  }

  function addSubtaskAndFocusNext() {
    pendingFocusIndexRef.current = subtasks.length;
    addSubtask();
  }

  function updateSubtaskTitle(key: Id, value: string) {
    setSubtasks((prev) => prev.map((s) => (s.key === key ? { ...s, title: value } : s)));
  }

  function removeSubtask(key: Id) {
    setSubtasks((prev) => prev.filter((s) => s.key !== key));
  }

  function moveSubtask(key: Id, direction: -1 | 1) {
    setSubtasks((prev) => {
      const index = prev.findIndex((s) => s.key === key);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  const isTitleMissing = title.trim().length === 0;
  const canSave = !isTitleMissing && !isRecurrenceIncomplete(recurrence);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onUpdate(template.id, {
        title: title.trim(),
        visual: { type: "lucide-icon", value: emoji },
        notes: notes.trim() || null,
        subtasks: subtasks
          .filter((s) => s.title.trim().length > 0)
          .map((s) => ({ title: s.title.trim(), timedMinutes: s.timedMinutes })),
        recurrence,
        starValue: Math.max(0, Math.floor(Number(starValueInput)) || 0),
        timerEnabled,
        plannedDurationMinutes:
          timerEnabled && plannedDurationMinutesInput
            ? Math.max(1, Math.min(480, Math.floor(Number(plannedDurationMinutesInput)) || 1))
            : null,
        timerMaxMinutes:
          timerEnabled && !plannedDurationMinutesInput && timerMaxMinutesInput
            ? Math.max(1, Math.min(720, Math.floor(Number(timerMaxMinutesInput)) || 1))
            : null
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="todo-thread-view__reuse-overlay" {...overlay}>
      <div
        aria-labelledby="template-edit-title"
        aria-modal="true"
        className="todo-template-edit-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="todo-template-edit-modal__header">
          <h3 id="template-edit-title">Redigera mall</h3>
          <div className="todo-template-edit-modal__header-actions">
            <button
              aria-label="Vad är en mall?"
              className="icon-button"
              onClick={() => setShowInfo(true)}
              title="Vad är en mall?"
              type="button"
            >
              <Info size={15} />
            </button>
            <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
              <X size={15} />
            </button>
          </div>
        </div>

        {showInfo && (
          <div className="todo-thread-view__reuse-overlay" {...infoOverlay}>
            <div
              aria-labelledby="template-info-title"
              aria-modal="true"
              className="todo-thread-view__reuse-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
            >
              <div className="todo-thread-view__info-header">
                <h3 id="template-info-title">Vad är en mall?</h3>
                <button aria-label="Stäng" className="icon-button" onClick={() => setShowInfo(false)} type="button">
                  <X size={16} />
                </button>
              </div>
              <p className="field-hint field-hint--neutral">
                En mall är en fryst kopia — ändringar här påverkar bara mallen själv, inte uppgifter som redan
                skapats från den tidigare. Nästa gång du väljer &quot;Hämta från mall&quot; används de nya värdena.
              </p>
            </div>
          </div>
        )}

        <div className="todo-template-edit-modal__body">
          <div className="todo-emoji-title-row">
            <EmojiPickerPortal onSelect={setEmoji} symbol={emoji} triggerClassName="todo-emoji-title-row__emoji-btn" />
            <label className="field-label todo-emoji-title-row__title">
              Titel
              <input
                autoFocus
                className="text-input"
                onChange={(e) => setTitle(e.target.value)}
                value={title}
              />
            </label>
          </div>
          {isTitleMissing && <p className="field-hint">Titel krävs.</p>}

          <label className="field-label">
            Stjärnor
            <input
              className="text-input"
              min={0}
              onChange={(e) => setStarValueInput(e.target.value)}
              type="number"
              value={starValueInput}
            />
            <span className="field-hint field-hint--neutral">
              Gäller bara om mallen senare hämtas åt ett barn — en vuxens egen kopia får alltid 0.
            </span>
          </label>

          <label className="todo-timer-toggle">
            <input
              checked={timerEnabled}
              onChange={(e) => setTimerEnabled(e.target.checked)}
              type="checkbox"
            />
            Tidtagning
          </label>
          {timerEnabled && (
            <label className="field-label">
              Planerad tid (minuter)
              <input
                className="text-input"
                max={480}
                min={1}
                onChange={(e) => setPlannedDurationMinutesInput(e.target.value)}
                placeholder="T.ex. 10"
                type="number"
                value={plannedDurationMinutesInput}
              />
            </label>
          )}

          {timerEnabled && !plannedDurationMinutesInput && (
            <label className="field-label">
              Stanna timern automatiskt efter (minuter)
              <input
                className="text-input"
                max={720}
                min={1}
                onChange={(e) => setTimerMaxMinutesInput(e.target.value)}
                placeholder="120 (2h) om tomt"
                type="number"
                value={timerMaxMinutesInput}
              />
            </label>
          )}

          <RecurrencePicker onChange={setRecurrence} value={recurrence} />

          <label className="field-label">
            Anteckningar
            <textarea
              className="text-input"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valfritt"
              rows={2}
              value={notes}
            />
          </label>

          <div className="field-label">
            <span>Delmoment</span>
            <ul className="todo-edit-modal__subtasks">
              {subtasks.map((subtask, index) => (
                <li className="todo-edit-modal__subtask-row" key={subtask.key}>
                  <input
                    aria-label="Delmomentets titel"
                    className="text-input"
                    onChange={(e) => updateSubtaskTitle(subtask.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && subtask.title.trim()) {
                        e.preventDefault();
                        addSubtaskAndFocusNext();
                      }
                    }}
                    placeholder="Till exempel Uppvärmning"
                    ref={(el) => { subtaskInputRefs.current[index] = el; }}
                    value={subtask.title}
                  />
                  <button
                    aria-label="Flytta delmoment upp"
                    className="icon-button"
                    disabled={index === 0}
                    onClick={() => moveSubtask(subtask.key, -1)}
                    type="button"
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    aria-label="Flytta delmoment ner"
                    className="icon-button"
                    disabled={index === subtasks.length - 1}
                    onClick={() => moveSubtask(subtask.key, 1)}
                    type="button"
                  >
                    <ChevronDown size={15} />
                  </button>
                  <button
                    aria-label="Ta bort delmoment"
                    className="icon-button"
                    onClick={() => removeSubtask(subtask.key)}
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <button className="secondary-button" onClick={addSubtask} type="button">
              <Plus size={13} />
              Lägg till delmoment
            </button>
          </div>
        </div>

        <div className="todo-thread-view__reuse-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            Avbryt
          </button>
          <button className="primary-button" disabled={!canSave || saving} onClick={() => void handleSave()} type="button">
            {saving ? "Sparar…" : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}
