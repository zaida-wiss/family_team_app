import { useEffect, useState } from "react";
import { shoppingApi } from "../../api";
import { trackEvent } from "../../utils/analytics";
import { generateId } from "../../utils/uuid";
import { readCache, writeCache } from "../../utils/localCache";
import type { AccessLevel, Id, ShoppingList } from "@shared/types";

const SHOPPING_CACHE_KEY = "shopping_v1";

export function useShoppingState() {
  // Stale-while-revalidate (2026-07-17) — se useTodosState.ts för samma mönster.
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>(() => readCache(SHOPPING_CACHE_KEY, []));

  useEffect(() => {
    shoppingApi.getAll().then(setShoppingLists).catch(console.error);
  }, []);

  useEffect(() => {
    writeCache(SHOPPING_CACHE_KEY, shoppingLists);
  }, [shoppingLists]);

  function createShoppingList(name: string, memberId: Id) {
    const newList: ShoppingList = {
      id: `shopping-${generateId()}`,
      name,
      ownerId: memberId,
      color: "#2f7d6d",
      icon: "ShoppingCart",
      sharedWith: [],
      deletedAt: null,
      deletedBy: null,
      items: []
    };

    shoppingApi.create(newList).catch(console.error);
    setShoppingLists((current) => [...current, newList]);
  }

  function addShoppingItem(listId: Id, title: string, memberId: Id) {
    const newItem: ShoppingList["items"][number] = {
      id: `shopping-item-${generateId()}`,
      title,
      createdBy: memberId,
      done: false,
      deletedAt: null,
      deletedBy: null
    };

    shoppingApi.addItem(listId, newItem).catch(console.error);
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        return { ...list, items: [...list.items, newItem] };
      })
    );
  }

  function shareShoppingList(listId: Id, memberId: Id, access: AccessLevel) {
    shoppingApi.share(listId, memberId, access).catch(console.error);
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        const existingShare = list.sharedWith.find((share) => share.memberId === memberId);

        return {
          ...list,
          sharedWith: existingShare
            ? list.sharedWith.map((share) =>
                share.memberId === memberId ? { ...share, access } : share
              )
            : [...list.sharedWith, { memberId, access }]
        };
      })
    );
  }

  function removeShoppingListShare(listId: Id, memberId: Id) {
    shoppingApi.unshare(listId, memberId).catch(console.error);
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        return {
          ...list,
          sharedWith: list.sharedWith.filter((share) => share.memberId !== memberId)
        };
      })
    );
  }

  function softDeleteShoppingList(listId: Id, memberId: Id) {
    shoppingApi.remove(listId).catch(console.error);
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        return {
          ...list,
          deletedAt: new Date().toISOString(),
          deletedBy: memberId
        };
      })
    );
  }

  function restoreShoppingList(listId: Id) {
    shoppingApi.restore(listId).catch(console.error);
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        return { ...list, deletedAt: null, deletedBy: null };
      })
    );
  }

  function toggleShoppingItem(listId: Id, itemId: Id) {
    shoppingApi.toggleItem(listId, itemId).catch(console.error);
    trackEvent("shopping-item-checked");
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        return {
          ...list,
          items: list.items.map((item) => {
            if (item.id !== itemId) {
              return item;
            }

            return { ...item, done: !item.done };
          })
        };
      })
    );
  }

  function softDeleteShoppingForMember(memberId: Id, deletedAt: string) {
    setShoppingLists((current) =>
      current.map((list) => {
        const ownsList = list.ownerId === memberId;

        if (ownsList) {
          shoppingApi.remove(list.id).catch(console.error);
        }

        return {
          ...list,
          sharedWith: list.sharedWith.filter((share) => share.memberId !== memberId),
          deletedAt: ownsList ? deletedAt : list.deletedAt,
          deletedBy: ownsList ? memberId : list.deletedBy,
          items: list.items.map((item) => {
            if (item.createdBy !== memberId) {
              return item;
            }

            return { ...item, deletedAt, deletedBy: memberId };
          })
        };
      })
    );
  }

  return {
    shoppingLists,
    createShoppingList,
    addShoppingItem,
    shareShoppingList,
    removeShoppingListShare,
    softDeleteShoppingList,
    restoreShoppingList,
    toggleShoppingItem,
    softDeleteShoppingForMember
  };
}
