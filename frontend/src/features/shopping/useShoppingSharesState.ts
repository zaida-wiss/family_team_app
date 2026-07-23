import { useCallback, useEffect, useState } from "react";
import { shoppingApi } from "../../api";
import { generateId } from "../../utils/uuid";
import type {
  ExternallySharedShoppingList,
  ShoppingListShare,
  ShoppingListShareCandidate
} from "../../api/shopping";
import type { AccessLevel, Id } from "@shared/types";

// Dela en inköpslista med en annan familj, icke-transitivt (ADR-0026,
// 2026-07-23) — samma tvådelade mönster som useChildSharesState.ts
// (ADR-0024): en hook för listor som DELATS MED mig (useSharedShoppingLists,
// visas i ShoppingView.tsx) och en för hanteringen av VEM JAG delar MINA
// egna listor med (useShoppingShareManagement, visas i Inställningar →
// Inköpslistor).

export function useSharedShoppingLists() {
  const [sharedLists, setSharedLists] = useState<ExternallySharedShoppingList[]>([]);

  const refresh = useCallback(() => {
    shoppingApi.getExternallyShared().then(setSharedLists).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function addItem(listId: Id, listAccountId: Id, title: string, memberId: Id) {
    const newItem = {
      id: `shopping-item-${generateId()}`,
      title,
      createdBy: memberId,
      done: false,
      deletedAt: null,
      deletedBy: null
    };
    setSharedLists((current) =>
      current.map((entry) =>
        entry.list.id !== listId ? entry : { ...entry, list: { ...entry.list, items: [...entry.list.items, newItem] } }
      )
    );
    shoppingApi.addItemToExternal(listId, listAccountId, newItem).then(refresh).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  function toggleItem(listId: Id, listAccountId: Id, itemId: Id) {
    setSharedLists((current) =>
      current.map((entry) =>
        entry.list.id !== listId
          ? entry
          : {
              ...entry,
              list: {
                ...entry.list,
                items: entry.list.items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item))
              }
            }
      )
    );
    shoppingApi.toggleExternalItem(listId, listAccountId, itemId).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  function removeItem(listId: Id, listAccountId: Id, itemId: Id) {
    setSharedLists((current) =>
      current.map((entry) =>
        entry.list.id !== listId
          ? entry
          : { ...entry, list: { ...entry.list, items: entry.list.items.filter((item) => item.id !== itemId) } }
      )
    );
    shoppingApi.removeExternalItem(listId, listAccountId, itemId).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  return { sharedLists, addItem, toggleItem, removeItem };
}

export function useShoppingShareManagement(listId: Id | null) {
  const [shares, setShares] = useState<ShoppingListShare[]>([]);
  const [candidates, setCandidates] = useState<ShoppingListShareCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!listId) {
      setShares([]);
      return;
    }
    shoppingApi.listExternalShares(listId).then(setShares).catch(console.error);
  }, [listId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function clearCandidates() {
    setCandidates(null);
  }

  async function lookup(email: string) {
    if (!listId) return;
    setLoading(true);
    try {
      const result = await shoppingApi.lookupExternalShareCandidate(listId, email);
      setCandidates(result.memberships);
    } finally {
      setLoading(false);
    }
  }

  async function grant(candidate: ShoppingListShareCandidate, access: AccessLevel) {
    if (!listId) return;
    await shoppingApi.shareListExternally(listId, candidate.memberId, candidate.accountId, access);
    setCandidates(null);
    refresh();
  }

  async function revoke(share: ShoppingListShare) {
    if (!listId) return;
    await shoppingApi.revokeExternalShare(listId, share.accountId, share.memberId);
    refresh();
  }

  return { shares, candidates, loading, lookup, grant, revoke, clearCandidates };
}
