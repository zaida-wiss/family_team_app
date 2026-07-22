import { Eye, EyeOff, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  canEditSharedResource,
  canViewResource,
  hasPermission
} from "../../utils/permissions";
import styles from "./ShoppingLists.module.css";
import type { Id, Member, Role, ShoppingList } from "@shared/types";

// Visning av bockade varor + redigeringsläge (2026-07-22, Zaidas önskemål:
// "tänk minimalistiskt") — bara lokalt, icke-persisterat UI-state per lista,
// återställs vid ny sidomladdning/panelbyte. Ersätter en tidigare
// tre-lägen-väljare (visa/bockade sist/dölj) med en enda av/på-toggle —
// synliga bockade varor hamnar alltid sist, ingen separat "inline"-ordning.
// Raderaknappen per rad visas bara i redigeringsläge, inte hela tiden.
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
  const [showCompleted, setShowCompleted] = useState<Record<Id, boolean>>({});
  const [editingLists, setEditingLists] = useState<Record<Id, boolean>>({});

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
        const shouldShowCompleted = showCompleted[list.id] ?? true;
        const isEditing = editable && (editingLists[list.id] ?? false);
        const visibleItems = shouldShowCompleted
          ? [...activeItems].sort((a, b) => Number(a.done) - Number(b.done))
          : activeItems.filter((i) => !i.done);

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
                <button
                  aria-pressed={shouldShowCompleted}
                  className={`secondary-button${shouldShowCompleted ? " icon-button--active" : ""}`}
                  onClick={() =>
                    setShowCompleted((prev) => ({ ...prev, [list.id]: !shouldShowCompleted }))
                  }
                  type="button"
                >
                  {shouldShowCompleted ? <Eye size={16} /> : <EyeOff size={16} />}
                  Visa avklarade
                </button>
                {editable && (
                  <button
                    aria-pressed={isEditing}
                    className={`secondary-button${isEditing ? " icon-button--active" : ""}`}
                    onClick={() =>
                      setEditingLists((prev) => ({ ...prev, [list.id]: !isEditing }))
                    }
                    type="button"
                  >
                    <Pencil size={16} />
                    {isEditing ? "Klar" : "Redigera"}
                  </button>
                )}
              </div>
            )}

            <ul className={styles.items}>
              {visibleItems.map((item) => (
                <li className={styles.itemRow} key={item.id}>
                  <span className={`${styles.itemLabel}${item.done ? ` ${styles.done}` : ""}`}>
                    <input
                      aria-label={item.title}
                      checked={item.done}
                      disabled={!editable}
                      onChange={() => onToggleItem(list.id, item.id)}
                      type="checkbox"
                    />
                    <span>{item.title}</span>
                  </span>
                  {isEditing && (
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

            {isEditing && doneCount > 0 && (
              <button
                aria-label={`Töm bockade varor i ${list.name}`}
                className={`secondary-button ${styles.clearButton}`}
                onClick={() => onClearCompleted(list.id)}
                type="button"
              >
                <Trash2 size={14} />
                Töm bockade varor
              </button>
            )}

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
