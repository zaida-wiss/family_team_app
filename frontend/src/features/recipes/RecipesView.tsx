import "./RecipesView.css";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useRecipesState } from "./useRecipesState";
import { RecipeFormModal } from "./RecipeFormModal";
import { RecipeDetailView } from "./RecipeDetailView";
import { RecipeImportExport } from "./RecipeImportExport";
import type { Id, Member, ShoppingList, Todo } from "@shared/types";

type SortMode = "name" | "newest";

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
  const { recipes, createRecipe, updateRecipe, removeRecipe, importRecipes } = useRecipesState();
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<Id | null>(null);
  // Filtrera/sortera/söktaggar (2026-07-25, Zaidas önskemål).
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("name");

  const selected = recipes.find((r) => r.id === selectedId) ?? null;
  const editing = recipes.find((r) => r.id === editingId) ?? null;

  const allTags = useMemo(
    () => [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, "sv")),
    [recipes]
  );

  const visibleRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return recipes
      .filter((r) => !activeTag || r.tags.includes(activeTag))
      .filter((r) => !query || r.name.toLowerCase().includes(query) || r.tags.some((t) => t.toLowerCase().includes(query)))
      .sort((a, b) =>
        sortMode === "name" ? a.name.localeCompare(b.name, "sv") : b.createdAt.localeCompare(a.createdAt)
      );
  }, [recipes, search, activeTag, sortMode]);

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

      {recipes.length > 0 && (
        <div className="recipes-toolbar">
          <input
            aria-label="Sök recept"
            className="text-input recipes-toolbar__search"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök namn eller tagg…"
            value={search}
          />
          <select aria-label="Sortera recept" className="text-input recipes-toolbar__sort" onChange={(e) => setSortMode(e.target.value as SortMode)} value={sortMode}>
            <option value="name">Namn (A–Ö)</option>
            <option value="newest">Senast tillagda</option>
          </select>
        </div>
      )}

      {allTags.length > 0 && (
        <div className="recipes-tag-filter" role="group" aria-label="Filtrera efter tagg">
          <button
            className={"recipes-tag-filter__chip" + (activeTag === null ? " recipes-tag-filter__chip--active" : "")}
            onClick={() => setActiveTag(null)}
            type="button"
          >
            Alla
          </button>
          {allTags.map((tag) => (
            <button
              className={"recipes-tag-filter__chip" + (activeTag === tag ? " recipes-tag-filter__chip--active" : "")}
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {recipes.length === 0 ? (
        <p className="empty-note">Inga recept än — lägg till ditt första.</p>
      ) : visibleRecipes.length === 0 ? (
        <p className="empty-note">Inga recept matchar filtret.</p>
      ) : (
        <div className="recipes-list">
          {visibleRecipes.map((recipe) => (
            <button className="recipe-card" key={recipe.id} onClick={() => setSelectedId(recipe.id)} type="button">
              {recipe.imageUrl ? (
                <img alt="" className="recipe-card__thumbnail" src={recipe.imageUrl} />
              ) : (
                <span aria-hidden="true" className="recipe-card__emoji">{recipe.emoji || "🍽️"}</span>
              )}
              <span className="recipe-card__name">{recipe.name}</span>
            </button>
          ))}
        </div>
      )}

      <RecipeImportExport onImport={importRecipes} recipes={recipes} />

      {showCreate && (
        <RecipeFormModal
          onClose={() => setShowCreate(false)}
          onSave={(input) => {
            createRecipe(input).catch(() => {});
            setShowCreate(false);
          }}
          recipe={null}
        />
      )}

      {editing && (
        <RecipeFormModal
          onClose={() => setEditingId(null)}
          onDelete={() => {
            removeRecipe(editing.id);
            setEditingId(null);
            setSelectedId(null);
          }}
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
          onEdit={() => setEditingId(selected.id)}
          recipe={selected}
          shoppingLists={shoppingLists}
        />
      )}
    </article>
  );
}
