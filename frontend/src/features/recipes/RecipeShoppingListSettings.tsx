import type { Account, Id, ShoppingList } from "@shared/types";

export const DEFAULT_RECIPE_SHOPPING_LIST_NAME = "Ingredienser från recept";

type Props = {
  account: Account;
  shoppingLists: ShoppingList[];
  onUpdate: (listId: Id | null) => void;
};

// Standard-inköpslista för receptingredienser (2026-07-27, Zaidas önskemål:
// "en ny lista som heter 'ingredienser från recept'... recepten hamnar under
// varandra i samma shoppinglista"). Väljer man ingen här (default) används/
// skapas automatiskt en lista med det namnet första gången — se
// AddToShoppingListModal.tsx. Den här väljaren låter man istället peka på en
// REDAN BEFINTLIG lista om man hellre vill samla ingredienserna någon
// annanstans.
export function RecipeShoppingListSettings({ account, shoppingLists, onUpdate }: Props) {
  const activeLists = shoppingLists.filter((l) => l.deletedAt === null);
  const currentId = account.defaultRecipeShoppingListId ?? "";

  return (
    <div className="recipe-shopping-list-settings">
      <p className="empty-note">
        Ingredienser du skickar till en inköpslista från ett recept hamnar automatiskt i samma lista varje gång,
        istället för att du behöver välja på nytt. Standard är en lista som heter &quot;{DEFAULT_RECIPE_SHOPPING_LIST_NAME}&quot;
        (skapas automatiskt första gången den behövs).
      </p>
      <label className="field-label">
        Standard-inköpslista för recept
        <select
          className="text-input"
          onChange={(e) => onUpdate(e.target.value || null)}
          value={currentId}
        >
          <option value="">{DEFAULT_RECIPE_SHOPPING_LIST_NAME} (standard)</option>
          {activeLists.map((list) => (
            <option key={list.id} value={list.id}>{list.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
