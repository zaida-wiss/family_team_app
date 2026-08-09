import { Combine, GripVertical, Pencil, Plus, Share2, ShoppingCart, Trash2, X } from "lucide-react";
import type { ClipboardEvent, PointerEvent } from "react";
import { ShoppingListExternalShare } from "./ShoppingListExternalShare";
import { linkifyText } from "../../hooks/useLinkifiedText";
import { useDelayedCompletionSort } from "../../hooks/useDelayedCompletionSort";
import styles from "./ShoppingLists.module.css";
import type { AccessLevel, Id, Member, ShoppingList } from "@shared/types";

type ShareDraft = { memberId: Id; access: AccessLevel };

// Gamla listor har "ShoppingCart" (en Lucide-ikon-NAMN-sträng, aldrig
// faktiskt visad förrän 2026-07-22) som icon — inte en emoji. Visa
// Lucide-ikonen för dem/listor utan vald symbol, en riktig emoji annars.
function ListIcon({ icon }: { icon: string | null }) {
  if (!icon || icon === "ShoppingCart") return <ShoppingCart size={18} />;
  return <span aria-hidden="true">{icon}</span>;
}

// Utbruten ur ShoppingView.tsx (2026-08-10) — bara för att kunna anropa
// useDelayedCompletionSort (senast avklarad varor sorteras sist, med en 5s
// fördröjning, se hooken) på TOPPNIVÅN av en egen komponent per lista; React
// tillåter inte hook-anrop inuti en .map()-callback. All state (redigerings-
// läge, delning, sammanslagning, drag m.m.) ägs FORTFARANDE av ShoppingView
// — den skickas ner som props, exakt samma beteende som innan, bara flyttat.
type Props = {
  list: ShoppingList;
  currentMember: Member;
  members: Member[];
  activeMembers: Member[];
  editable: boolean;
  otherEditableLists: ShoppingList[];
  shouldShowCompleted: boolean;
  onToggleShowCompleted: () => void;
  isEditing: boolean;
  onToggleEditingMode: () => void;
  isSharing: boolean;
  onToggleSharing: () => void;
  shareDraft: ShareDraft;
  onShareDraftMemberChange: (memberId: Id) => void;
  onShareDraftAccessChange: (access: AccessLevel) => void;
  onConfirmShare: () => void;
  onRemoveShare: (memberId: Id) => void;
  isMerging: boolean;
  onToggleMerging: () => void;
  mergeTargetId: Id | null;
  onMergeTargetChange: (id: Id | null) => void;
  onConfirmMerge: () => void;
  onDeleteListClick: () => void;
  nameDraft: string;
  onNameDraftChange: (value: string) => void;
  onSaveListName: () => void;
  draftItemValue: string;
  onDraftItemChange: (value: string) => void;
  onAddItemClick: () => void;
  onItemPaste: (e: ClipboardEvent<HTMLInputElement>) => void;
  onToggleItem: (itemId: Id) => void;
  onDeleteItem: (itemId: Id) => void;
  onClearCompleted: () => void;
  draggingItemId: Id | null;
  dragOverItemId: Id | null;
  onItemPointerDown: (e: PointerEvent<HTMLButtonElement>, itemId: Id) => void;
  onItemPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onItemPointerUp: (visibleItemIds: Id[]) => void;
};

export function ShoppingListCard({
  list,
  currentMember,
  members,
  activeMembers,
  editable,
  otherEditableLists,
  shouldShowCompleted,
  onToggleShowCompleted,
  isEditing,
  onToggleEditingMode,
  isSharing,
  onToggleSharing,
  shareDraft,
  onShareDraftMemberChange,
  onShareDraftAccessChange,
  onConfirmShare,
  onRemoveShare,
  isMerging,
  onToggleMerging,
  mergeTargetId,
  onMergeTargetChange,
  onConfirmMerge,
  onDeleteListClick,
  nameDraft,
  onNameDraftChange,
  onSaveListName,
  draftItemValue,
  onDraftItemChange,
  onAddItemClick,
  onItemPaste,
  onToggleItem,
  onDeleteItem,
  onClearCompleted,
  draggingItemId,
  dragOverItemId,
  onItemPointerDown,
  onItemPointerMove,
  onItemPointerUp
}: Props) {
  const activeItems = list.items.filter((i) => i.deletedAt === null);
  const doneCount = activeItems.filter((i) => i.done).length;
  // Senast avklarad överst bland de avklarade, men gruppbytet (aktiv →
  // avklarad, och tvärtom) fördröjs 5s från senaste knapptryck (2026-08-10,
  // Zaidas önskemål) — ordningen bland ej avklarade varor (t.ex. manuellt
  // dragen) rörs aldrig. Döljer man avklarade helt (shouldShowCompleted av)
  // filtreras de bara bort direkt, ingen fördröjning behövs då.
  const sortedItems = useDelayedCompletionSort(activeItems, (i) => i.id, (i) => i.done);
  const visibleItems = shouldShowCompleted ? sortedItems : activeItems.filter((i) => !i.done);

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <div>
          <ListIcon icon={list.icon} />
          {isEditing ? (
            <input
              aria-label={`Namn på ${list.name}`}
              className="text-input"
              onBlur={onSaveListName}
              onChange={(e) => onNameDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              type="text"
              value={nameDraft}
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
          <input checked={shouldShowCompleted} onChange={onToggleShowCompleted} role="switch" type="checkbox" />
          <span>Visa avklarade</span>
        </label>
        {editable && (
          <div className={styles.toolbarActions}>
            <button
              aria-label={`Dela ${list.name}`}
              aria-pressed={isSharing}
              className={`icon-button${isSharing ? " icon-button--active" : ""}`}
              onClick={onToggleSharing}
              type="button"
            >
              <Share2 size={16} />
            </button>
            <button
              aria-label={isEditing ? `Klar med redigering av ${list.name}` : `Redigera ${list.name}`}
              aria-pressed={isEditing}
              className={`icon-button${isEditing ? " icon-button--active" : ""}`}
              onClick={onToggleEditingMode}
              type="button"
            >
              <Pencil size={16} />
            </button>
            {isEditing && otherEditableLists.length > 0 && (
              <button
                aria-label={`Slå ihop ${list.name} med en annan lista`}
                aria-pressed={isMerging}
                className={`icon-button${isMerging ? " icon-button--active" : ""}`}
                onClick={onToggleMerging}
                type="button"
              >
                <Combine size={16} />
              </button>
            )}
            {isEditing && (
              <button
                aria-label={`Radera ${list.name}`}
                className="icon-button danger"
                onClick={onDeleteListClick}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {isMerging && (
        <div className={styles.sharePanel}>
          <div className={styles.addRow}>
            <select
              aria-label={`Slå ihop ${list.name} med`}
              className="text-input"
              onChange={(e) => onMergeTargetChange(e.target.value || null)}
              value={mergeTargetId ?? ""}
            >
              <option value="">Välj lista att slå ihop med</option>
              {otherEditableLists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <button
              aria-label={`Slå ihop ${list.name} in i vald lista`}
              className="icon-button"
              disabled={!mergeTargetId}
              onClick={onConfirmMerge}
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
              onChange={(e) => onShareDraftMemberChange(e.target.value)}
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
              onChange={(e) => onShareDraftAccessChange(e.target.value as AccessLevel)}
              value={shareDraft.access}
            >
              <option value="view">Bara se</option>
              <option value="edit">Redigera</option>
            </select>
            <button
              aria-label="Dela lista"
              className="icon-button"
              disabled={!shareDraft.memberId}
              onClick={onConfirmShare}
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
                    onClick={() => onRemoveShare(share.memberId)}
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
                onPointerDown={(e) => onItemPointerDown(e, item.id)}
                onPointerMove={onItemPointerMove}
                onPointerUp={() => onItemPointerUp(visibleItems.map((i) => i.id))}
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
                onChange={() => onToggleItem(item.id)}
                type="checkbox"
              />
              <span>{linkifyText(item.title)}</span>
            </span>
            {isEditing && (
              <button
                aria-label={`Ta bort ${item.title}`}
                className="icon-button danger"
                onClick={() => onDeleteItem(item.id)}
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
          onClick={onClearCompleted}
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
            onChange={(e) => onDraftItemChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onAddItemClick(); }}
            onPaste={onItemPaste}
            placeholder="Lägg till vara"
            value={draftItemValue}
          />
          <button aria-label="Lägg till vara" className="icon-button" onClick={onAddItemClick} type="button">
            <Plus size={16} />
          </button>
        </div>
      )}
    </article>
  );
}
