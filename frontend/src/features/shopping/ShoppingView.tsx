import { Pencil, Plus, Share2, ShoppingCart, Trash2, X } from "lucide-react";
import { useState } from "react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import {
  canEditSharedResource,
  canViewResource,
  hasPermission
} from "../../utils/permissions";
import styles from "./ShoppingLists.module.css";
import type { AccessLevel, Id, Member, Role, ShoppingList } from "@shared/types";

// Visning av bockade varor + redigeringsläge (2026-07-22, Zaidas önskemål:
// "tänk minimalistiskt") — bara lokalt, icke-persisterat UI-state per lista,
// återställs vid ny sidomladdning/panelbyte. Synliga bockade varor hamnar
// alltid sist. Raderaknappen per rad och delningspanelen visas bara i
// redigeringsläge, inte hela tiden — Redigera-knappen är medvetet bara en
// ikon (ingen text).
type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  shoppingLists: ShoppingList[];
  onAddItem: (listId: Id, title: string) => void;
  onToggleItem: (listId: Id, itemId: Id) => void;
  onDeleteItem: (listId: Id, itemId: Id) => void;
  onClearCompleted: (listId: Id) => void;
  onCreateList: (name: string, icon?: string | null) => void;
  onShareList: (listId: Id, memberId: Id, access: AccessLevel) => void;
  onRemoveListShare: (listId: Id, memberId: Id) => void;
};

type ShareDraft = { memberId: Id; access: AccessLevel };

// Gamla listor har "ShoppingCart" (en Lucide-ikon-NAMN-sträng, aldrig
// faktiskt visad förrän nu) som icon — inte en emoji. Visa Lucide-ikonen för
// dem/listor utan vald symbol, en riktig emoji (vald via EmojiPickerPortal,
// 2026-07-22) för nya.
function ListIcon({ icon }: { icon: string | null }) {
  if (!icon || icon === "ShoppingCart") return <ShoppingCart size={18} />;
  return <span aria-hidden="true">{icon}</span>;
}

export function ShoppingView({
  currentMember,
  members,
  roles,
  shoppingLists,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onClearCompleted,
  onCreateList,
  onShareList,
  onRemoveListShare
}: Props) {
  const [draftItems, setDraftItems] = useState<Record<Id, string>>({});
  const [showCompleted, setShowCompleted] = useState<Record<Id, boolean>>({});
  const [editingLists, setEditingLists] = useState<Record<Id, boolean>>({});
  const [sharingListId, setSharingListId] = useState<Id | null>(null);
  const [shareDrafts, setShareDrafts] = useState<Record<Id, ShareDraft>>({});
  const [creatingList, setCreatingList] = useState(false);
  const [draftListName, setDraftListName] = useState("");
  const [draftListIcon, setDraftListIcon] = useState("");

  const canEdit = hasPermission(currentMember, roles, "canEditShoppingLists");
  const canCreate = hasPermission(currentMember, roles, "canCreateShoppingLists");

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

  function createList() {
    const name = draftListName.trim();
    if (!name || !canCreate) return;
    onCreateList(name, draftListIcon || null);
    setDraftListName("");
    setDraftListIcon("");
    setCreatingList(false);
  }

  function getDefaultShareDraft(): ShareDraft {
    return {
      memberId: members.find((m) => m.id !== currentMember.id)?.id ?? "",
      access: "view"
    };
  }

  function getShareDraft(listId: Id): ShareDraft {
    return shareDrafts[listId] ?? getDefaultShareDraft();
  }

  return (
    <div className="dashboard-list">
      {canCreate && (
        <div className={styles.card}>
          {creatingList ? (
            <div className={styles.addRow}>
              <EmojiPickerPortal
                onSelect={setDraftListIcon}
                symbol={draftListIcon}
                triggerClassName="icon-button"
              />
              <input
                autoFocus
                className="text-input"
                onChange={(e) => setDraftListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createList();
                  if (e.key === "Escape") setCreatingList(false);
                }}
                placeholder="Namn på listan"
                value={draftListName}
              />
              <button
                aria-label="Skapa lista"
                className="icon-button"
                disabled={!draftListName.trim()}
                onClick={createList}
                type="button"
              >
                <Plus size={16} />
              </button>
            </div>
          ) : (
            <button
              className="secondary-button"
              onClick={() => setCreatingList(true)}
              type="button"
            >
              <Plus size={16} />
              Ny lista
            </button>
          )}
        </div>
      )}

      {visible.length === 0 && !canCreate && (
        <article className="dashboard">
          <header className="section-header">
            <div><p className="eyebrow">Inköp</p><h2>Inga inköpslistor</h2></div>
          </header>
          <p className="empty-note">Du har inga tillgängliga inköpslistor.</p>
        </article>
      )}

      {visible.map((list) => {
        const editable = canEditList(list);
        const activeItems = list.items.filter((i) => i.deletedAt === null);
        const doneCount = activeItems.filter((i) => i.done).length;
        const shouldShowCompleted = showCompleted[list.id] ?? true;
        const isEditing = editable && (editingLists[list.id] ?? false);
        const isSharing = sharingListId === list.id;
        const shareDraft = getShareDraft(list.id);
        const visibleItems = shouldShowCompleted
          ? [...activeItems].sort((a, b) => Number(a.done) - Number(b.done))
          : activeItems.filter((i) => !i.done);

        return (
          <article className={styles.card} key={list.id}>
            <div className={styles.header}>
              <div>
                <ListIcon icon={list.icon} />
                <strong>{list.name}</strong>
              </div>
              {activeItems.length > 0 && (
                <small style={{ color: "var(--muted-fg)" }}>
                  {doneCount}/{activeItems.length} klart
                </small>
              )}
            </div>

            <div className={styles.toolbar}>
              <label className={styles.toggleSwitch}>
                <input
                  checked={shouldShowCompleted}
                  onChange={() =>
                    setShowCompleted((prev) => ({ ...prev, [list.id]: !shouldShowCompleted }))
                  }
                  role="switch"
                  type="checkbox"
                />
                <span>Visa avklarade</span>
              </label>
              {editable && (
                <div className={styles.toolbarActions}>
                  <button
                    aria-label={`Dela ${list.name}`}
                    aria-pressed={isSharing}
                    className={`icon-button${isSharing ? " icon-button--active" : ""}`}
                    onClick={() => setSharingListId(isSharing ? null : list.id)}
                    type="button"
                  >
                    <Share2 size={16} />
                  </button>
                  <button
                    aria-label={isEditing ? `Klar med redigering av ${list.name}` : `Redigera ${list.name}`}
                    aria-pressed={isEditing}
                    className={`icon-button${isEditing ? " icon-button--active" : ""}`}
                    onClick={() => setEditingLists((prev) => ({ ...prev, [list.id]: !isEditing }))}
                    type="button"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              )}
            </div>

            {isSharing && (
              <div className={styles.sharePanel}>
                <div className={styles.addRow}>
                  <select
                    aria-label="Välj medlem att dela med"
                    className="text-input"
                    onChange={(e) =>
                      setShareDrafts((prev) => ({ ...prev, [list.id]: { ...shareDraft, memberId: e.target.value } }))
                    }
                    value={shareDraft.memberId}
                  >
                    <option value="">Välj medlem</option>
                    {members
                      .filter((m) => m.id !== currentMember.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </select>
                  <select
                    aria-label="Behörighetsnivå"
                    className="text-input"
                    onChange={(e) =>
                      setShareDrafts((prev) => ({
                        ...prev,
                        [list.id]: { ...shareDraft, access: e.target.value as AccessLevel }
                      }))
                    }
                    value={shareDraft.access}
                  >
                    <option value="view">Bara se</option>
                    <option value="edit">Redigera</option>
                  </select>
                  <button
                    aria-label="Dela lista"
                    className="icon-button"
                    disabled={!shareDraft.memberId}
                    onClick={() => onShareList(list.id, shareDraft.memberId, shareDraft.access)}
                    type="button"
                  >
                    <Share2 size={16} />
                  </button>
                </div>
                {list.sharedWith.length > 0 && (
                  <ul className={styles.items}>
                    {list.sharedWith.map((share) => (
                      <li className={styles.itemRow} key={share.memberId}>
                        <span>
                          {members.find((m) => m.id === share.memberId)?.name ?? "Okänd medlem"}
                          {" — "}
                          {share.access === "edit" ? "Kan redigera" : "Kan se"}
                        </span>
                        <button
                          aria-label={`Ta bort delning med ${members.find((m) => m.id === share.memberId)?.name ?? "okänd medlem"}`}
                          className="icon-button danger"
                          onClick={() => onRemoveListShare(list.id, share.memberId)}
                          type="button"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
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
