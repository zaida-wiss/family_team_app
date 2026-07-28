import { useEffect, useState } from "react";
import { shoppingApi } from "../../api";
import { trackEvent } from "../../utils/analytics";
import { generateId } from "../../utils/uuid";
import { readCache, writeCache } from "../../utils/localCache";
import { deferToIdle } from "../../utils/deferToIdle";
import type { AccessLevel, Id, ShoppingList } from "@shared/types";

const SHOPPING_CACHE_KEY = "shopping_v1";

export function useShoppingState() {
  // Stale-while-revalidate (2026-07-17) — se useTodosState.ts för samma mönster.
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>(() => readCache(SHOPPING_CACHE_KEY, []));

  useEffect(() => {
    // Skjuts upp till efter första målningen (2026-07-26, prestandaomgången
    // S1a) — se deferToIdle.ts.
    deferToIdle(() => { shoppingApi.getAll().then(setShoppingLists).catch(console.error); });
  }, []);

  useEffect(() => {
    writeCache(SHOPPING_CACHE_KEY, shoppingLists);
  }, [shoppingLists]);

  // icon (2026-07-22, Zaidas önskemål: "välja symbol") — tidigare alltid
  // hårdkodad till "ShoppingCart" (en Lucide-ikon-NAMN-sträng, aldrig
  // faktiskt visad någonstans). Nya listor får nu en riktig emoji vald via
  // samma delade EmojiPickerPortal som todos/belöningar/rutiner redan
  // använder — se ShoppingView.tsx:s renderIcon för bakåtkompatibilitet med
  // gamla listor som fortfarande har den gamla "ShoppingCart"-strängen.
  function createShoppingList(name: string, memberId: Id, icon: string | null = null) {
    const newList: ShoppingList = {
      id: `shopping-${generateId()}`,
      name,
      ownerId: memberId,
      color: "#2f7d6d",
      icon,
      sharedWith: [],
      deletedAt: null,
      deletedBy: null,
      items: []
    };

    shoppingApi.create(newList).catch(console.error);
    setShoppingLists((current) => [...current, newList]);
    // Returnerar det klientgenererade id:t (2026-07-25, ADR-0028) — så en
    // anropare (t.ex. receptens "skapa ny lista och lägg till ingredienser
    // direkt") kan fortsätta lägga till varor utan en extra hämtning.
    return newList.id;
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

  // Massimport (2026-07-28, Zaidas önskemål: "all data ska alltid gå att
  // importera och exportera i de olika kategorierna i inställningar") — en
  // rad = en vara, grupperad per listnamn. En lista med matchande namn
  // (skiftlägesokänsligt) återanvänds, annars skapas en ny (samma
  // "Egen kategori"-auto-skapande-princip som todoCsv.ts:s import). Buntar i
  // grupper om 4 med en kort paus (ADR-0023), samma mönster som
  // useRecipesState.ts:s importRecipes.
  async function importShoppingItems(rows: { listName: string; title: string; done: boolean }[], memberId: Id) {
    const listIdByName = new Map(
      shoppingLists.filter((l) => l.deletedAt === null).map((l) => [l.name.toLowerCase(), l.id])
    );

    for (let i = 0; i < rows.length; i += 4) {
      const batch = rows.slice(i, i + 4);
      await Promise.all(
        batch.map(async (row) => {
          const key = row.listName.toLowerCase();
          let listId = listIdByName.get(key);
          if (!listId) {
            listId = createShoppingList(row.listName, memberId);
            listIdByName.set(key, listId);
          }
          const item: ShoppingList["items"][number] = {
            id: `shopping-item-${generateId()}`,
            title: row.title,
            createdBy: memberId,
            done: row.done,
            deletedAt: null,
            deletedBy: null
          };
          await shoppingApi.addItem(listId, item);
          if (row.done) {
            await shoppingApi.toggleItem(listId, item.id);
          }
        })
      );
      if (i + 4 < rows.length) await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const fresh = await shoppingApi.getAll();
    setShoppingLists(fresh);
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

  // 2026-07-28, Zaidas önskemål: "inköpslistorna måste gå att ändra namn på
  // när man trycker på redigera" — samma optimistiska mönster som övriga
  // mutationer i denna hook.
  function renameShoppingList(listId: Id, name: string) {
    shoppingApi.update(listId, { name }).catch(console.error);
    setShoppingLists((current) =>
      current.map((list) => (list.id === listId ? { ...list, name } : list))
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

  // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av papperskorgen.
  async function purgeShoppingTrash() {
    await shoppingApi.purgeTrash();
    setShoppingLists((current) => current.filter((list) => list.deletedAt === null));
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

  // Radera enskild rad (2026-07-22, Zaidas önskemål) — mjuk radering, samma
  // mönster som övriga borttagningar i appen.
  function deleteShoppingItem(listId: Id, itemId: Id, memberId: Id) {
    shoppingApi.removeItem(listId, itemId).catch(console.error);
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        return {
          ...list,
          items: list.items.map((item) =>
            item.id === itemId ? { ...item, deletedAt: new Date().toISOString(), deletedBy: memberId } : item
          )
        };
      })
    );
  }

  // Drag-and-drop-ordning på varorna (2026-07-26, Zaidas önskemål) —
  // itemIds är den nya, kompletta ordningen för listans SYNLIGA varor.
  function reorderShoppingItems(listId: Id, itemIds: Id[]) {
    shoppingApi.reorderItems(listId, itemIds).catch(console.error);
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) return list;
        const byId = new Map(list.items.map((item) => [item.id, item]));
        const ordered = itemIds.map((id) => byId.get(id)).filter((item): item is ShoppingList["items"][number] => item !== undefined);
        const orderedIds = new Set(ordered.map((item) => item.id));
        const rest = list.items.filter((item) => !orderedIds.has(item.id));
        return { ...list, items: [...ordered, ...rest] };
      })
    );
  }

  // Töm listan (2026-07-22, Zaidas önskemål: "töm listan kan vara ett val")
  // — rensar bara BOCKADE varor, en enskild rad tas bort via deleteShoppingItem.
  function clearCompletedShoppingItems(listId: Id, memberId: Id) {
    shoppingApi.clearCompleted(listId).catch(console.error);
    const now = new Date().toISOString();
    setShoppingLists((current) =>
      current.map((list) => {
        if (list.id !== listId) {
          return list;
        }

        return {
          ...list,
          items: list.items.map((item) =>
            item.done && item.deletedAt === null ? { ...item, deletedAt: now, deletedBy: memberId } : item
          )
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
    importShoppingItems,
    shareShoppingList,
    removeShoppingListShare,
    softDeleteShoppingList,
    renameShoppingList,
    restoreShoppingList,
    purgeShoppingTrash,
    toggleShoppingItem,
    deleteShoppingItem,
    reorderShoppingItems,
    clearCompletedShoppingItems,
    softDeleteShoppingForMember
  };
}
