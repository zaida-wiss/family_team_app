import "./RecipesView.css";
import { useState } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import { generateId } from "../../utils/uuid";
import type { Id, Member, Recipe, Todo } from "@shared/types";

type Props = {
  recipe: Recipe;
  currentMember: Member;
  onCreateTodo: (todo: Todo) => void;
  onClose: () => void;
};

function toDateTimeString(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

// "Skapa uppgift" (2026-07-25, ADR-0028) — datum+tid, sedan EN todo med ett
// delmoment PER receptsteg. Ingen mottagarväljare i denna första version —
// hamnar i den delade Familjen-tråden (assignedTo: null), samma
// "vem som helst kan slutföra en otilldelad uppgift"-princip som redan
// gäller där (2026-07-23).
export function CreateTodoFromRecipeModal({ recipe, currentMember, onCreateTodo, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [when, setWhen] = useState("");

  function submit() {
    const visibleFrom = toDateTimeString(when);
    if (!visibleFrom) return;
    onCreateTodo({
      id: `todo-${generateId()}`,
      title: recipe.name,
      createdBy: currentMember.id,
      assignedTo: null,
      isShared: false,
      status: "pending",
      starValue: 0,
      visual: { type: "lucide-icon", value: recipe.emoji ?? "" },
      recurrence: { type: "none" },
      recurringSourceId: null,
      occurrenceDate: null,
      visibleFrom,
      expiresAt: null,
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectedReason: null,
      deletedAt: null,
      deletedBy: null,
      personalCategoryId: null,
      notes: null,
      subtasks: recipe.steps.map((step) => ({
        id: generateId() as Id,
        title: step.text,
        done: false,
        timedMinutes: step.timedMinutes,
        timerStartedAt: null
      })),
      timerEnabled: false,
      plannedDurationMinutes: null,
      elapsedMs: null
    });
    onClose();
  }

  return (
    <div className="recipe-modal-overlay" onClick={onClose}>
      <div
        aria-labelledby="recipe-create-todo-title"
        aria-modal="true"
        className="recipe-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="recipe-modal__header">
          <h3 id="recipe-create-todo-title">Skapa uppgift av {recipe.name}</h3>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <p className="empty-note">
          Skapar en uppgift i Familjen-tråden med ett delmoment per steg — {recipe.steps.length} steg totalt.
        </p>
        <label className="field-label">
          Datum och tid
          <input className="text-input" onChange={(e) => setWhen(e.target.value)} type="datetime-local" value={when} />
        </label>
        <div className="todo-thread-view__reuse-actions">
          <button className="secondary-button" onClick={onClose} type="button">Avbryt</button>
          <button className="primary-button" disabled={!when} onClick={submit} type="button">Skapa</button>
        </div>
      </div>
    </div>
  );
}
