import "./RecipesView.css";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useRecipesState } from "./useRecipesState";
import { RecipeFormModal } from "./RecipeFormModal";
import { RecipeDetailView } from "./RecipeDetailView";
import type { Id, Member, ShoppingList, Todo } from "@shared/types";

type Props = {
  currentMember: Member;
  shoppingLists: ShoppingList[];
  onCreateTodo: (todo: Todo) => void;
  onAddShoppingItem: (listId: Id, title: string) => void;
  onCreateShoppingList: (name: string, icon?: string | null) => Id;
};

// Recept, ny huvudpanel (2026-07-25, ADR-0028, Zaidas önskemål: "recept i
// våran app som en egen kategori i menyn"). Kontobrett — hela familjen ser
// samma recept, mutationer kräver en vuxen (server-side, recipesService.ts).
export function RecipesView({ currentMember, shoppingLists, onCreateTodo, onAddShoppingItem, onCreateShoppingList }: Props) {
  const { recipes, createRecipe, updateRecipe, removeRecipe } = useRecipesState();
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<Id | null>(null);

  const selected = recipes.find((r) => r.id === selectedId) ?? null;
  const editing = recipes.find((r) => r.id === editingId) ?? null;

  return (
    <article className="dashboard">
      <header className="section-header">
        <div>
          <p className="eyebrow">Recept</p>
          <h2>Recept</h2>
        </div>
        <button className="icon-button" onClick={() => setShowCreate(true)} title="Nytt recept" type="button">
          <Plus size={16} />
        </button>
      </header>

      {recipes.length === 0 ? (
        <p className="empty-note">Inga recept än — lägg till ditt första.</p>
      ) : (
        <div className="recipes-list">
          {recipes.map((recipe) => (
            <button className="recipe-card" key={recipe.id} onClick={() => setSelectedId(recipe.id)} type="button">
              <span aria-hidden="true" className="recipe-card__emoji">{recipe.emoji || "🍽️"}</span>
              <span className="recipe-card__name">{recipe.name}</span>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <RecipeFormModal
          onClose={() => setShowCreate(false)}
          onSave={(input) => {
            createRecipe(input);
            setShowCreate(false);
          }}
          recipe={null}
        />
      )}

      {editing && (
        <RecipeFormModal
          onClose={() => setEditingId(null)}
          onSave={(input) => {
            updateRecipe(editing.id, input);
            setEditingId(null);
          }}
          recipe={editing}
        />
      )}

      {selected && !editing && (
        <RecipeDetailView
          currentMember={currentMember}
          onAddShoppingItem={onAddShoppingItem}
          onCreateShoppingList={onCreateShoppingList}
          onCreateTodo={onCreateTodo}
          onClose={() => setSelectedId(null)}
          onDelete={() => {
            removeRecipe(selected.id);
            setSelectedId(null);
          }}
          onEdit={() => setEditingId(selected.id)}
          recipe={selected}
          shoppingLists={shoppingLists}
        />
      )}
    </article>
  );
}
