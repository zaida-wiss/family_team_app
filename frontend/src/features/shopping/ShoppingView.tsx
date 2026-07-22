import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  canEditSharedResource,
  canViewResource,
  hasPermission
} from "../../utils/permissions";
import styles from "./ShoppingLists.module.css";
import type { Id, Member, Role, ShoppingList } from "@shared/types";

// Visning av bockade varor (2026-07-22, Zaidas önskemål) — bara ett lokalt,
// icke-persisterat UI-val per lista, återställs vid ny sidomladdning/panelbyte.
// Zaida bad inte om att det ska sparas, bara att kunna VÄLJA — ingen ny
// medlemsinställning/backend-fält behövdes.
type CompletedDisplayMode = "inline" | "bottom" | "hidden";

type Props = {
  currentMember: Member;
  roles: Role[];
  shoppingLists: ShoppingList[];
  onAddItem: (listId: Id, title: string) => void;
  onToggleItem: (listId: Id, itemId: Id) => void;
  onDeleteItem: (listId: Id, itemId: Id) => void;
  onClearCompleted: (listId: Id) => void;
};

export function ShoppingView({
  currentMember,
  roles,
  shoppingLists,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onClearCompleted
}: Props) {
  const [draftItems, setDraftItems] = useState<Record<Id, string>>({});
  const [displayModes, setDisplayModes] = useState<Record<Id, CompletedDisplayMode>>({});

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
        const displayMode = displayModes[list.id] ?? "inline";
        const visibleItems =
          displayMode === "hidden"
            ? activeItems.filter((i) => !i.done)
            : displayMode === "bottom"
              ? [...activeItems].sort((a, b) => Number(a.done) - Number(b.done))
              : activeItems;

        return (
          <article className={styles.card} key={list.id}>
            <div className={styles.header}>
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

            {activeItems.length > 0 && (
              <div className={styles.toolbar}>
                <select
                  aria-label={`Visning av bockade varor i ${list.name}`}
                  className={styles.displayModeSelect}
                  onChange={(e) =>
                    setDisplayModes((prev) => ({
                      ...prev,
                      [list.id]: e.target.value as CompletedDisplayMode
                    }))
                  }
                  value={displayMode}
                >
                  <option value="inline">Visa bockade</option>
                  <option value="bottom">Bockade sist</option>
                  <option value="hidden">Dölj bockade</option>
                </select>
                {editable && doneCount > 0 && (
                  <button
                    aria-label={`Töm bockade varor i ${list.name}`}
                    className={`secondary-button ${styles.clearButton}`}
                    onClick={() => onClearCompleted(list.id)}
                    type="button"
                  >
                    <Trash2 size={14} />
                    Töm listan
                  </button>
                )}
              </div>
            )}

            <ul className={styles.items}>
              {visibleItems.map((item) => (
                <li className={styles.itemRow} key={item.id}>
                  <label className={item.done ? styles.done : undefined}>
                    <input
                      checked={item.done}
                      disabled={!editable}
                      onChange={() => onToggleItem(list.id, item.id)}
                      type="checkbox"
                    />
                    <span>{item.title}</span>
                  </label>
                  {editable && (
                    <button
                      aria-label={`Ta bort ${item.title}`}
                      className="icon-button danger"
                      onClick={() => onDeleteItem(list.id, item.id)}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {editable && (
              <div className={styles.addRow}>
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
                  aria-label="Lägg till vara"
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
