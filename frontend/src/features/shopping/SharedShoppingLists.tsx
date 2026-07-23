import { Lock, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSharedShoppingLists } from "./useShoppingSharesState";
import styles from "./ShoppingLists.module.css";
import type { Id, Member } from "@shared/types";

type Props = {
  currentMember: Member;
};

function ListIcon({ icon }: { icon: string | null }) {
  if (!icon || icon === "ShoppingCart") return <ShoppingCart size={18} />;
  return <span aria-hidden="true">{icon}</span>;
}

// Dela en inköpslista med en annan familj, icke-transitivt (ADR-0026,
// 2026-07-23, Zaidas önskemål: "shoppinglistor skall kunna delas mellan
// olika familjer") — ett eget, tillagt kort PER lista som delats MED mig
// (av ägaren i EN ANNAN, eller samma, familj). Medvetet en egen komponent
// istället för inbyggd i ShoppingView.tsx, samma resonemang som
// SharedChildrenThreads.tsx (ADR-0024): en delad lista hör inte till mitt
// eget kontos vanliga sharedWith/dela-flöde, och listan/dess ägare kan
// inte hanteras härifrån.
export function SharedShoppingLists({ currentMember }: Props) {
  const { sharedLists, addItem, toggleItem, removeItem } = useSharedShoppingLists();
  const [draftItems, setDraftItems] = useState<Record<Id, string>>({});

  if (sharedLists.length === 0) return null;

  function submitAdd(listId: Id, listAccountId: Id) {
    const title = draftItems[listId]?.trim();
    if (!title) return;
    addItem(listId, listAccountId, title, currentMember.id);
    setDraftItems((prev) => ({ ...prev, [listId]: "" }));
  }

  return (
    <div className="dashboard-list">
      {sharedLists.map(({ list, access }) => {
        const activeItems = list.items.filter((i) => i.deletedAt === null);
        const editable = access === "edit";

        return (
          <article className={styles.card} key={`${list.accountId}-${list.id}`}>
            <div className={styles.header}>
              <div>
                <ListIcon icon={list.icon} />
                <strong>{list.name}</strong>
                {!editable && (
                  <Lock aria-label="Endast visning" className={styles.lock} size={14} />
                )}
              </div>
            </div>

            <ul className={styles.items}>
              {activeItems.map((item) => (
                <li className={styles.itemRow} key={item.id}>
                  <span className={`${styles.itemLabel}${item.done ? ` ${styles.done}` : ""}`}>
                    <input
                      aria-label={item.title}
                      checked={item.done}
                      disabled={!editable}
                      onChange={() => toggleItem(list.id, list.accountId!, item.id)}
                      type="checkbox"
                    />
                    <span>{item.title}</span>
                  </span>
                  {editable && (
                    <button
                      aria-label={`Ta bort ${item.title}`}
                      className="icon-button danger"
                      onClick={() => removeItem(list.id, list.accountId!, item.id)}
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
                  onChange={(e) => setDraftItems((prev) => ({ ...prev, [list.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") submitAdd(list.id, list.accountId!); }}
                  placeholder="Lägg till vara"
                  value={draftItems[list.id] ?? ""}
                />
                <button
                  aria-label="Lägg till vara"
                  className="icon-button"
                  onClick={() => submitAdd(list.id, list.accountId!)}
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
