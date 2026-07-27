import "./RecipesView.css";
import { useState } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import { generateId } from "../../utils/uuid";
import { ingredientDisplayText } from "./recipeScaling";
import type { Id, Member, Recipe, Todo } from "@shared/types";

type Props = {
  recipe: Recipe;
  currentMember: Member;
  // Förifyllt Antal personer (2026-07-26, Zaidas fråga: "kan jag välja nu
  // hur många personer jag ska tillaga för?" — "även när jag skapar en
  // uppgift för det... skall man fylla i för hur många personer det skall
  // beräknas på") — receptvyns egen "just nu"-räknare (activeServings) om
  // satt, annars receptets sparade default.
  initialServings: number | null;
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
export function CreateTodoFromRecipeModal({ recipe, currentMember, initialServings, onCreateTodo, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [when, setWhen] = useState("");
  // Sträng-baserat lokalt state (samma mönster som RecipeFormModal.tsx:s
  // servingsInput).
  const [servingsInput, setServingsInput] = useState(initialServings != null ? String(initialServings) : "");

  function submit() {
    const visibleFrom = toDateTimeString(when);
    if (!visibleFrom) return;
    const servings = servingsInput ? Math.max(1, Math.floor(Number(servingsInput)) || 0) || null : null;
    // Ingredienslistan i anteckningarna (2026-07-27, Zaidas fråga: "är
    // todo-kopian... uppdaterad med enheterna och antal från receptet?") —
    // skalade mängder (ingredientDisplayText, samma som Handlingslista-
    // modalen redan använder) för de rader som har mängd, annars bara namnet.
    const ingredientLines = recipe.ingredients.map((i) => `– ${ingredientDisplayText(i, recipe.servings, servings)}`);
    const notesLines = [
      servings ? `Räknat för ${servings} ${servings === 1 ? "person" : "personer"}.` : null,
      ingredientLines.length > 0 ? ["Ingredienser:", ...ingredientLines].join("\n") : null
    ].filter((line): line is string => line !== null);
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
      notes: notesLines.length > 0 ? notesLines.join("\n\n") : null,
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
        <label className="field-label recipe-form__servings">
          Antal personer
          <input
            className="text-input"
            inputMode="numeric"
            onChange={(e) => setServingsInput(e.target.value.replace(/\D/g, ""))}
            placeholder="Till exempel 4"
            value={servingsInput}
          />
        </label>
        <div className="recipe-form__actions">
          <button className="secondary-button" onClick={onClose} type="button">Avbryt</button>
          <button className="primary-button" disabled={!when} onClick={submit} type="button">Skapa</button>
        </div>
      </div>
    </div>
  );
}
