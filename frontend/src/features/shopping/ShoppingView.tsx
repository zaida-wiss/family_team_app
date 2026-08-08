import { Combine, GripVertical, Pencil, Plus, Share2, ShoppingCart, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { ShoppingListExternalShare } from "./ShoppingListExternalShare";
import { readCache, writeCache } from "../../utils/localCache";
import { linkifyText } from "../../hooks/useLinkifiedText";
import { splitPastedShoppingItems } from "./parseShoppingPaste";
import {
  canEditSharedResource,
  canViewResource,
  hasPermission
} from "../../utils/permissions";
import styles from "./ShoppingLists.module.css";
import type { AccessLevel, Id, Member, Role, ShoppingList } from "@shared/types";

const DRAG_THRESHOLD_PX = 8;
const SHOW_COMPLETED_CACHE_KEY = "shopping_show_completed_v1";

// Visning av bockade varor + redigeringsläge (2026-07-22, Zaidas önskemål:
// "tänk minimalistiskt"). "Visa avklarade" per lista sparas nu på ENHETEN
// (2026-07-27, Zaidas fynd: "sparas inställningen [inte] om jag växlar vy...
// det ska sparas på enheten") — var tidigare bara lokal komponent-state,
// nollställdes vid varje panelbyte (samma remount-mönster som redan
// dokumenterats för andra paneler, ErrorBoundary key={activePanel}). En
// lista som aldrig fått ett eget val på DENNA enhet faller tillbaka på
// showCompletedDefault (medlemmens inställning, Inställningar →
// Inköpslistor), annars "visa" — oförändrat beteende. Synliga bockade varor
// hamnar alltid sist. Raderaknappen per rad och delningspanelen visas bara
// i redigeringsläge, inte hela tiden — Redigera-knappen är medvetet bara en
// ikon (ingen text).
type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  shoppingLists: ShoppingList[];
  showCompletedDefault?: boolean;
  onAddItem: (listId: Id, title: string) => void;
  onToggleItem: (listId: Id, itemId: Id) => void;
  onDeleteItem: (listId: Id, itemId: Id) => void;
  onReorderItems: (listId: Id, itemIds: Id[]) => void;
  onClearCompleted: (listId: Id) => void;
  onCreateList: (name: string, icon?: string | null) => void;
  onDeleteList: (listId: Id) => void;
  onRenameList: (listId: Id, name: string) => void;
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
  showCompletedDefault,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onReorderItems,
  onClearCompleted,
  onCreateList,
  onDeleteList,
  onRenameList,
  onShareList,
  onRemoveListShare
}: Props) {
  const [draftItems, setDraftItems] = useState<Record<Id, string>>({});
  // Sparat på ENHETEN, inte per komponent-mount (se filhuvudets kommentar) —
  // lazy-init från localStorage, skrivs om vid varje ändring.
  const [showCompleted, setShowCompleted] = useState<Record<Id, boolean>>(() =>
    readCache(SHOW_COMPLETED_CACHE_KEY, {})
  );

  function setListShowCompleted(listId: Id, value: boolean) {
    setShowCompleted((prev) => {
      const next = { ...prev, [listId]: value };
      writeCache(SHOW_COMPLETED_CACHE_KEY, next);
      return next;
    });
  }
  const [editingLists, setEditingLists] = useState<Record<Id, boolean>>({});
  const [sharingListId, setSharingListId] = useState<Id | null>(null);
  const [shareDrafts, setShareDrafts] = useState<Record<Id, ShareDraft>>({});
  const [creatingList, setCreatingList] = useState(false);
  const [draftListName, setDraftListName] = useState("");
  const [draftListIcon, setDraftListIcon] = useState("");
  const [mergingListId, setMergingListId] = useState<Id | null>(null);
  // Byt namn i redigeringsläge (2026-07-28, Zaidas önskemål: "inköpslistorna
  // måste gå att ändra namn på när man trycker på redigera") — sparas vid
  // blur/Enter, samma mönster som ShoppingListsPanel.tsx.
  const [nameDrafts, setNameDrafts] = useState<Record<Id, string>>({});

  function saveListName(list: ShoppingList) {
    const draft = nameDrafts[list.id]?.trim();
    if (draft && draft !== list.name) {
      onRenameList(list.id, draft);
    }
    setNameDrafts((current) => {
      const next = { ...current };
      delete next[list.id];
      return next;
    });
  }
  const [mergeTargetId, setMergeTargetId] = useState<Id | null>(null);
  // Drag-and-drop-ordning på varorna (2026-07-26) — pointer-baserat, samma
  // mönster som ParentTodoThreadView.tsx:s bubbel-drag inom en tråd.
  const itemDragStateRef = useRef<{ listId: Id; itemId: Id; x: number; y: number } | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<Id | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<Id | null>(null);

  const canEdit = hasPermission(currentMember, roles, "canEditShoppingLists");
  const canCreate = hasPermission(currentMember, roles, "canCreateShoppingLists");
  // Soft-deletade medlemmar ska inte gå att välja i delnings-listan
  // (2026-07-23, Zaidas fynd) — namn-uppslaget för en redan gjord delning
  // (nedan) förblir medvetet ofiltrerat.
  const activeMembers = members.filter((m) => m.deletedAt === null);

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

  // Klistra in flera varor på en gång, en per rad (2026-08-09, Zaidas
  // önskemål: "bara de har ett radbryt, eller semikolon") — en enda vara
  // (inget separatortecken hittat) lämnas till fältets vanliga klistra-in-
  // hantering istället, så en vanlig enstaka inklistring beter sig som förut.
  function handleItemPaste(e: ClipboardEvent<HTMLInputElement>, listId: Id) {
    const list = shoppingLists.find((l) => l.id === listId);
    if (!list || !canEditList(list)) return;
    const items = splitPastedShoppingItems(e.clipboardData.getData("text"));
    if (items.length <= 1) return;
    e.preventDefault();
    items.forEach((title) => onAddItem(listId, title));
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
      memberId: activeMembers.find((m) => m.id !== currentMember.id)?.id ?? "",
      access: "view"
    };
  }

  function getShareDraft(listId: Id): ShareDraft {
    return shareDrafts[listId] ?? getDefaultShareDraft();
  }

  function handleItemPointerDown(e: React.PointerEvent<HTMLButtonElement>, listId: Id, itemId: Id) {
    itemDragStateRef.current = { listId, itemId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleItemPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const start = itemDragStateRef.current;
    if (!start) return;
    if (draggingItemId === null) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      setDraggingItemId(start.itemId);
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const li = el instanceof Element ? el.closest<HTMLElement>("[data-item-id]") : null;
    if (li && li.dataset.listId === start.listId) {
      setDragOverItemId(li.dataset.itemId as Id);
    } else {
      setDragOverItemId(null);
    }
  }

  function handleItemPointerUp(visibleItemIds: Id[]) {
    const start = itemDragStateRef.current;
    const target = dragOverItemId;
    itemDragStateRef.current = null;
    if (start && target && start.itemId !== target) {
      const from = visibleItemIds.indexOf(start.itemId);
      const to = visibleItemIds.indexOf(target);
      if (from !== -1 && to !== -1) {
        const next = [...visibleItemIds];
        next.splice(from, 1);
        next.splice(to, 0, start.itemId);
        onReorderItems(start.listId, next);
      }
    }
    setDraggingItemId(null);
    setDragOverItemId(null);
  }

  // Slå ihop två listor (2026-07-26, Zaidas önskemål) — återanvänder
  // befintliga onAddItem/onDeleteList, ingen ny backend-endpoint. Varorna
  // läggs till som NYA, obockade rader i målet (samma "en rad i taget"-
  // mönster som CSV-importen) — bockad status från källistan förs medvetet
  // inte över, en enkel avvägning. Källistan raderas (mjukt) efteråt.
  function mergeListInto(sourceListId: Id, targetListId: Id) {
    const source = shoppingLists.find((l) => l.id === sourceListId);
    const target = shoppingLists.find((l) => l.id === targetListId);
    if (!source || !target || !canEditList(source) || !canEditList(target)) return;
    for (const item of source.items.filter((i) => i.deletedAt === null)) {
      onAddItem(targetListId, item.title);
    }
    onDeleteList(sourceListId);
    setMergingListId(null);
    setMergeTargetId(null);
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
        const shouldShowCompleted = showCompleted[list.id] ?? showCompletedDefault ?? true;
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
                {isEditing ? (
                  <input
                    aria-label={`Namn på ${list.name}`}
                    className="text-input"
                    onBlur={() => saveListName(list)}
                    onChange={(e) => setNameDrafts((current) => ({ ...current, [list.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    type="text"
                    value={nameDrafts[list.id] ?? list.name}
                  />
                ) : (
                  <strong>{list.name}</strong>
                )}
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
                  onChange={() => setListShowCompleted(list.id, !shouldShowCompleted)}
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
                    onClick={() => {
                      if (!isEditing) {
                        setEditingLists((prev) => ({ ...prev, [list.id]: true }));
                        return;
                      }
                      // Lämnar redigeringsläget — spara ett ev. öppet
                      // namnbyte och nollställ en öppen sammanslagning.
                      saveListName(list);
                      setEditingLists((prev) => ({ ...prev, [list.id]: false }));
                      setMergingListId((current) => (current === list.id ? null : current));
                    }}
                    type="button"
                  >
                    <Pencil size={16} />
                  </button>
                  {isEditing && shoppingLists.filter((l) => l.id !== list.id && l.deletedAt === null && canEditList(l)).length > 0 && (
                    <button
                      aria-label={`Slå ihop ${list.name} med en annan lista`}
                      aria-pressed={mergingListId === list.id}
                      className={`icon-button${mergingListId === list.id ? " icon-button--active" : ""}`}
                      onClick={() => {
                        setMergingListId((current) => (current === list.id ? null : list.id));
                        setMergeTargetId(null);
                      }}
                      type="button"
                    >
                      <Combine size={16} />
                    </button>
                  )}
                  {/* 2026-07-28, Zaidas önskemål: "man ska inte behöva
                      trycka flera ggr på tex delete knappen" — Radera-knappen
                      tar bort direkt i redigeringsläge (ett klick, inte ett
                      extra Bekräfta-steg ovanpå), samma mönster som
                      ShoppingListsPanel.tsx (Inställningar → Inköpslistor)
                      redan använde. Redigeringsläget är själva säkerhets-
                      spärren (2026-07-22: "ingenting skall gå att radera om
                      man inte trycker redigera först"), oförändrat. */}
                  {isEditing && (
                    <button
                      aria-label={`Radera ${list.name}`}
                      className="icon-button danger"
                      onClick={() => onDeleteList(list.id)}
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {mergingListId === list.id && (
              <div className={styles.sharePanel}>
                <div className={styles.addRow}>
                  <select
                    aria-label={`Slå ihop ${list.name} med`}
                    className="text-input"
                    onChange={(e) => setMergeTargetId(e.target.value || null)}
                    value={mergeTargetId ?? ""}
                  >
                    <option value="">Välj lista att slå ihop med</option>
                    {shoppingLists
                      .filter((l) => l.id !== list.id && l.deletedAt === null && canEditList(l))
                      .map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                  </select>
                  <button
                    aria-label={`Slå ihop ${list.name} in i vald lista`}
                    className="icon-button"
                    disabled={!mergeTargetId}
                    onClick={() => mergeTargetId && mergeListInto(list.id, mergeTargetId)}
                    type="button"
                  >
                    <Combine size={16} />
                  </button>
                </div>
                <p className="empty-note">
                  Alla varor från {list.name} läggs till i den valda listan, sedan raderas {list.name}.
                </p>
              </div>
            )}

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
                    {activeMembers
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
                <ShoppingListExternalShare listId={list.id} />
              </div>
            )}

            <ul className={styles.items}>
              {visibleItems.map((item) => (
                <li
                  className={`${styles.itemRow}${dragOverItemId === item.id && draggingItemId !== item.id ? ` ${styles.dragOver}` : ""}`}
                  data-item-id={item.id}
                  data-list-id={list.id}
                  key={item.id}
                >
                  {isEditing && (
                    <button
                      aria-label={`Dra för att flytta ${item.title}`}
                      className={`icon-button ${styles.dragHandle}`}
                      onPointerDown={(e) => handleItemPointerDown(e, list.id, item.id)}
                      onPointerMove={handleItemPointerMove}
                      onPointerUp={() => handleItemPointerUp(visibleItems.map((i) => i.id))}
                      type="button"
                    >
                      <GripVertical size={14} />
                    </button>
                  )}
                  <span className={`${styles.itemLabel}${item.done ? ` ${styles.done}` : ""}`}>
                    <input
                      aria-label={item.title}
                      checked={item.done}
                      disabled={!editable}
                      onChange={() => onToggleItem(list.id, item.id)}
                      type="checkbox"
                    />
                    <span>{linkifyText(item.title)}</span>
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
                  onPaste={(e) => handleItemPaste(e, list.id)}
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
