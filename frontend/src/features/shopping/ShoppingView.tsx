import { Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import {
  canEditSharedResource,
  canViewResource,
  hasPermission
} from "../../utils/permissions";
import type { Id, Member, Role, ShoppingList } from "@shared/types";

type Props = {
  currentMember: Member;
  roles: Role[];
  shoppingLists: ShoppingList[];
  onAddItem: (listId: Id, title: string) => void;
  onToggleItem: (listId: Id, itemId: Id) => void;
};

export function ShoppingView({
  currentMember,
  roles,
  shoppingLists,
  onAddItem,
  onToggleItem
}: Props) {
  const [draftItems, setDraftItems] = useState<Record<Id, string>>({});

  const canEdit = hasPermission(currentMember, roles, "canEditShoppingLists");

  const visible = shoppingLists.filter((list) => {
    if (list.deletedAt !== null) return false;
    return (
      hasPermission(currentMember, roles, "canSeeShoppingLists") &&
      canViewResource(currentMember, list)
    );
  });

  function canEditList(list: ShoppingList) {
    return canEdit && canEditSharedResource(currentMember, list);
  }

  function addItem(listId: Id) {
    const title = draftItems[listId]?.trim();
    const list = shoppingLists.find((l) => l.id === listId);
    if (!title || !list || !canEditList(list)) return;
    onAddItem(listId, title);
    setDraftItems((prev) => ({ ...prev, [listId]: "" }));
  }

  if (visible.length === 0) {
    return (
      <article className="dashboard">
        <header className="section-header">
          <div><p className="eyebrow">Inköp</p><h2>Inga inköpslistor</h2></div>
        </header>
        <p className="empty-note">Du har inga tillgängliga inköpslistor. Skapa en i Inställningar.</p>
      </article>
    );
  }

  return (
    <div className="dashboard-list">
      {visible.map((list) => {
        const editable = canEditList(list);
        const activeItems = list.items.filter((i) => i.deletedAt === null);
        const doneCount = activeItems.filter((i) => i.done).length;

        return (
          <article className="shopping-card" key={list.id}>
            <div className="shopping-card-header">
              <div>
                <ShoppingCart size={18} />
                <strong>{list.name}</strong>
              </div>
              {activeItems.length > 0 && (
                <small style={{ color: "var(--muted-fg)" }}>
                  {doneCount}/{activeItems.length} klart
                </small>
              )}
            </div>

            <ul className="shopping-items">
              {activeItems.map((item) => (
                <li key={item.id}>
                  <label className={item.done ? "done" : ""}>
                    <input
                      checked={item.done}
                      disabled={!editable}
                      onChange={() => onToggleItem(list.id, item.id)}
                      type="checkbox"
                    />
                    <span>{item.title}</span>
                  </label>
                </li>
              ))}
            </ul>

            {editable && (
              <div className="shopping-add-row">
                <input
                  className="text-input"
                  onChange={(e) =>
                    setDraftItems((prev) => ({ ...prev, [list.id]: e.target.value }))
                  }
                  onKeyDown={(e) => { if (e.key === "Enter") addItem(list.id); }}
                  placeholder="Lägg till vara"
                  value={draftItems[list.id] ?? ""}
                />
                <button
                  className="icon-button"
                  onClick={() => addItem(list.id)}
                  type="button"
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
