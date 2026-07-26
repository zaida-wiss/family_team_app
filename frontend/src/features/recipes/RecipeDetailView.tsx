import "./RecipesView.css";
import { useState } from "react";
import { ArrowLeft, CalendarPlus, ExternalLink, Pencil, ShoppingCart, Trash2, X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import { CreateTodoFromRecipeModal } from "./CreateTodoFromRecipeModal";
import { AddToShoppingListModal } from "./AddToShoppingListModal";
import type { Id, Member, Recipe, ShoppingList, Todo } from "@shared/types";

type Props = {
  recipe: Recipe;
  currentMember: Member;
  shoppingLists: ShoppingList[];
  onCreateTodo: (todo: Todo) => void;
  onAddShoppingItem: (listId: Id, title: string) => void;
  onCreateShoppingList: (name: string, icon?: string | null) => Id;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

// Receptets läsvy (2026-07-25, ADR-0028) — de två integrationsknapparna
// ("Skapa uppgift"/"Handlingslista") öppnar var sin liten modal, se
// CreateTodoFromRecipeModal.tsx/AddToShoppingListModal.tsx.
export function RecipeDetailView({
  recipe, currentMember, shoppingLists, onCreateTodo, onAddShoppingItem, onCreateShoppingList, onEdit, onDelete, onClose
}: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [showCreateTodo, setShowCreateTodo] = useState(false);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="recipe-modal-overlay" onClick={onClose}>
      <div
        aria-labelledby="recipe-detail-title"
        aria-modal="true"
        className="recipe-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="recipe-modal__header">
          <button aria-label="Tillbaka" className="icon-button" onClick={onClose} type="button">
            <ArrowLeft size={16} />
          </button>
          <h3 id="recipe-detail-title">{recipe.emoji ? `${recipe.emoji} ` : ""}{recipe.name}</h3>
          <button aria-label="Redigera recept" className="icon-button" onClick={onEdit} type="button">
            <Pencil size={16} />
          </button>
        </div>

        {recipe.imageUrl && <img alt="" className="recipe-detail__image" src={recipe.imageUrl} />}

        {recipe.sourceUrl && (
          <a className="recipe-detail__source-link" href={recipe.sourceUrl} rel="noreferrer" target="_blank">
            <ExternalLink size={14} /> Källa
          </a>
        )}

        <p className="eyebrow">Ingredienser</p>
        <ul className="recipe-detail__ingredients">
          {recipe.ingredients.map((i) => <li key={i.id}>{i.text}</li>)}
        </ul>

        <p className="eyebrow">Steg</p>
        <ol className="recipe-detail__steps">
          {recipe.steps.map((s) => (
            <li className="recipe-detail__step" key={s.id}>
              <span>{s.text}</span>
              {s.timedMinutes != null && <span className="recipe-detail__step-timer">⏱ {s.timedMinutes} min</span>}
            </li>
          ))}
        </ol>

        <div className="recipe-detail__actions">
          <button className="secondary-button" onClick={() => setShowCreateTodo(true)} type="button">
            <CalendarPlus size={14} /> Skapa uppgift
          </button>
          <button className="secondary-button" onClick={() => setShowShoppingList(true)} type="button">
            <ShoppingCart size={14} /> Handlingslista
          </button>
          {confirmDelete ? (
            <>
              <button className="secondary-button" onClick={onDelete} type="button">Bekräfta radering</button>
              <button aria-label="Avbryt radering" className="icon-button" onClick={() => setConfirmDelete(false)} type="button">
                <X size={14} />
              </button>
            </>
          ) : (
            <button aria-label="Radera recept" className="icon-button danger" onClick={() => setConfirmDelete(true)} type="button">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {showCreateTodo && (
        <CreateTodoFromRecipeModal
          currentMember={currentMember}
          onClose={() => setShowCreateTodo(false)}
          onCreateTodo={onCreateTodo}
          recipe={recipe}
        />
      )}
      {showShoppingList && (
        <AddToShoppingListModal
          onAddShoppingItem={onAddShoppingItem}
          onClose={() => setShowShoppingList(false)}
          onCreateShoppingList={onCreateShoppingList}
          recipe={recipe}
          shoppingLists={shoppingLists}
        />
      )}
    </div>
  );
}
