import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { shoppingLists as initialShoppingLists } from "../../data/sampleData";
import type { AccessLevel, Id, ShoppingList } from "@shared/types";

export function useShoppingState() {
  const [shoppingLists, setShoppingLists] = useLocalStorageState<ShoppingList[]>(
    "family-team-app:shopping-lists",
    initialShoppingLists
  );

  function createShoppingList(name: string, memberId: Id) {
    setShoppingLists((current) => [
      ...current,
      {
        id: `shopping-${crypto.randomUUID()}`,
        name,
        ownerId: memberId,
        color: "#2f7d6d",
        icon: "ShoppingCart",
        sharedWith: [],
        deletedAt: null,
        deletedBy: null,
        items: []
      }
    ]);
  }

  function addShoppingItem(listId: Id, title: string, memberId: Id) {
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        return {
          ...list,
          items: [
            ...list.items,
            {
              id: `shopping-item-${crypto.randomUUID()}`,
              title,
              createdBy: memberId,
              done: false,
              deletedAt: null,
              deletedBy: null
            }
          ]
        };
      })
    );
  }

  function shareShoppingList(listId: Id, memberId: Id, access: AccessLevel) {
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
