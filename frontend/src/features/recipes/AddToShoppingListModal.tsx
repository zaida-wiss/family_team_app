import "./RecipesView.css";
import { useState } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import type { Id, Recipe, ShoppingList } from "@shared/types";

const NEW_LIST_VALUE = "__new__";

type Props = {
  recipe: Recipe;
  shoppingLists: ShoppingList[];
  // Förifyllt Antal personer (2026-07-26, se CreateTodoFromRecipeModal.tsx
  // för samma resonemang).
  initialServings: number | null;
  onAddShoppingItem: (listId: Id, title: string) => void;
  onCreateShoppingList: (name: string, icon?: string | null) => Id;
  onClose: () => void;
};

// "Handlingslista" (2026-07-25, ADR-0028) — välj en befintlig inköpslista
// eller skapa en ny, sedan en onAddShoppingItem-anrop per ingrediens (samma
// "en operation per rad"-mönster som CSV-importen redan använder).
export function AddToShoppingListModal({ recipe, shoppingLists, initialServings, onAddShoppingItem, onCreateShoppingList, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const activeLists = shoppingLists.filter((l) => l.deletedAt === null);
  const [targetListId, setTargetListId] = useState<string>(activeLists[0]?.id ?? NEW_LIST_VALUE);
  const [newListName, setNewListName] = useState(recipe.name);
  // Ingredienserna är fri text (ingen strukturerad mängd/enhet) — antalet
  // personer räknar INTE om raderna, bara en egen informationsrad överst i
  // listan så det syns vilket antal ingredienserna nedan gäller.
  const [servingsInput, setServingsInput] = useState(initialServings != null ? String(initialServings) : "");

  const canSubmit = targetListId === NEW_LIST_VALUE ? newListName.trim().length > 0 : true;

  function submit() {
    if (!canSubmit) return;
    const listId = targetListId === NEW_LIST_VALUE ? onCreateShoppingList(newListName.trim(), recipe.emoji) : (targetListId as Id);
    const servings = servingsInput ? Math.max(1, Math.floor(Number(servingsInput)) || 0) || null : null;
    if (servings) {
      onAddShoppingItem(listId, `🧮 ${recipe.name} — för ${servings} ${servings === 1 ? "person" : "personer"} (ej omräknat)`);
    }
    for (const ingredient of recipe.ingredients) {
      onAddShoppingItem(listId, ingredient.text);
    }
    onClose();
  }

  return (
    <div className="recipe-modal-overlay" onClick={onClose}>
      <div
        aria-labelledby="recipe-shopping-title"
        aria-modal="true"
        className="recipe-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="recipe-modal__header">
          <h3 id="recipe-shopping-title">Handlingslista från {recipe.name}</h3>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <p className="empty-note">Lägger till {recipe.ingredients.length} ingredienser i vald lista.</p>
        <label className="field-label">
          Lista
          <select className="text-input" onChange={(e) => setTargetListId(e.target.value)} value={targetListId}>
            {activeLists.map((list) => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
            <option value={NEW_LIST_VALUE}>+ Ny lista…</option>
          </select>
        </label>
        {targetListId === NEW_LIST_VALUE && (
          <label className="field-label">
            Namn på ny lista
            <input autoFocus className="text-input" onChange={(e) => setNewListName(e.target.value)} value={newListName} />
          </label>
        )}
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
          <button className="primary-button" disabled={!canSubmit} onClick={submit} type="button">Lägg till</button>
        </div>
      </div>
    </div>
  );
}
