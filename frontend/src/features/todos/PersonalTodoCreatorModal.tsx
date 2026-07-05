import "./PersonalTodoCreatorModal.css";
import { useState } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import { generateId } from "../../utils/uuid";
import type { Id, Todo, TodoCategory } from "@shared/types";

const NEW_CATEGORY_VALUE = "__new__";

type Props = {
  categories: TodoCategory[];
  currentMemberId: Id;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onCreateTodo: (todo: Todo) => void;
  onClose: () => void;
};

// Platsbesparande modal (2026-07-05, Zaidas beslut) — ersätter de tidigare
// spridda inline-affordanserna (en "Lägg till"-knapp per tråd + en egen
// "Ny kategori"-kolumn) med EN liten ikon som öppnar denna modal: skapa en
// personlig todo och välj en befintlig kategori, eller skapa en helt ny
// kategori direkt här (textfältet för ett nytt namn dyker bara upp när man
// faktiskt behöver det — progressiv avslöjning, inte alltid synligt).
export function PersonalTodoCreatorModal({
  categories,
  currentMemberId,
  onCreateCategory,
  onCreateTodo,
  onClose
}: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [title, setTitle] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    categories[0]?.id ?? NEW_CATEGORY_VALUE
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isCreatingCategory = categories.length === 0 || selectedCategoryId === NEW_CATEGORY_VALUE;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;

    setSubmitting(true);
    try {
      let categoryId = selectedCategoryId;
      if (isCreatingCategory) {
        const trimmedName = newCategoryName.trim();
        if (!trimmedName) return;
        const category = await onCreateCategory(trimmedName);
        categoryId = category.id;
      }

      onCreateTodo({
        id: `todo-${generateId()}`,
        title: trimmedTitle,
        createdBy: currentMemberId,
        assignedTo: currentMemberId,
        isShared: false,
        status: "pending",
        starValue: 0,
        visual: { type: "lucide-icon", value: "Star" },
        recurrence: { type: "none" },
        recurringSourceId: null,
        occurrenceDate: null,
        visibleFrom: null,
        expiresAt: null,
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: null,
        deletedAt: null,
        deletedBy: null,
        personalCategoryId: categoryId
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="personal-todo-creator-overlay" onClick={onClose}>
      <div
        aria-labelledby="personal-todo-creator-title"
        aria-modal="true"
        className="personal-todo-creator-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="personal-todo-creator-modal__hdr">
          <span id="personal-todo-creator-title">Ny egen uppgift</span>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form className="personal-todo-creator-modal__body" onSubmit={handleSubmit}>
          <label className="field-label">
            Titel
            <input
              autoFocus
              className="text-input"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Till exempel Handla mat"
              value={title}
            />
          </label>

          {categories.length > 0 && (
            <label className="field-label">
              Kategori
              <select
                className="text-input"
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                value={selectedCategoryId}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
                <option value={NEW_CATEGORY_VALUE}>+ Ny kategori…</option>
              </select>
            </label>
          )}

          {isCreatingCategory && (
            <label className="field-label">
              {categories.length === 0 ? "Kategorinamn" : "Namn på ny kategori"}
              <input
                autoFocus={categories.length === 0}
                className="text-input"
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Till exempel Träning"
                value={newCategoryName}
              />
            </label>
          )}

          <button className="primary-button" disabled={submitting} type="submit">
            Skapa
          </button>
        </form>
      </div>
    </div>
  );
}
