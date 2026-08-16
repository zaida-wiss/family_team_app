import { useCallback, useEffect, useState } from "react";
import { accountsApi, membersApi, recipesApi, shoppingApi, todosApi } from "../../api";
import type { CrossAccountShoppingLists } from "../../api/shopping";
import type { CrossAccountRecipes } from "../../api/recipes";
import { generateId } from "../../utils/uuid";
import type { CrossAccountFamilyThread, FamilyMembersGroup, Id, MembershipMemberSummary, MyMembership, ShoppingList, Todo } from "@shared/types";

type ApiResult = { ok: true } | { ok: false; error: unknown };

// Mina familjekonton (2026-07-25, Zaidas önskemål: "du skall se vilka
// familjer du är med i... kunna avmarkera dessa när de inte används...
// dyka upp på ställen som todo som familjen vid rätt namn"). Skiljer sig
// från ADR-0024/dela-barn (useChildSharesState.ts) — det här är mina EGNA,
// riktiga medlemskap i andra konton, inte en delnings-grant från någon
// annan. Två skilda hooks, samma uppdelning som useChildSharesState.ts:
// tråd-vyns visning (useCrossAccountFamilyTodos) och Inställningars
// bocka-av/på-lista (useMyMemberships).

export function useCrossAccountFamilyTodos() {
  const [threads, setThreads] = useState<CrossAccountFamilyThread[]>([]);

  const refresh = useCallback(() => {
    // Defensiv Array.isArray-kontroll (samma mönster som redan etablerats
    // för cross-account-kalendrar) — nu även hämtat GLOBALT av
    // MemberShellContent.tsx (Hem-vyns familjefilter, 2026-07-31), inte
    // längre bara medan Todos-panelens tråd-vy visas.
    todosApi.getFamilyAcrossAccounts().then((data) => setThreads(Array.isArray(data) ? data : [])).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Samma SSE-kanal som vanliga todos — completeCrossAccountFamilyTodo
  // (backend) anropar samma broadcastTodosChanged() som alla andra
  // todo-mutationer.
  useEffect(() => todosApi.subscribeToChanges(refresh), [refresh]);

  function completeCrossAccountTodo(accountId: Id, todoId: Id) {
    setThreads((current) =>
      current.map((thread) =>
        thread.accountId !== accountId
          ? thread
          : { ...thread, todos: thread.todos.map((t) => (t.id === todoId ? { ...t, status: "done" as const } : t)) }
      )
    );
    todosApi.completeFamilyAcrossAccounts(accountId, todoId).then(refresh).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  // Lägg till/Ta/Släpp en Familjen-uppgift (2026-08-01, Zaidas önskemål:
  // "kunna lägga till nya todos som är förinställda på den aktuella
  // familjen... precis som i min egen todo-vy") — samma "familjekonto jag
  // faktiskt är en riktig medlem av"-princip som complete ovan.
  function createCrossAccountTodo(accountId: Id, title: string, visual: string | null) {
    return todosApi.createFamilyAcrossAccounts(accountId, title, visual).then(refresh);
  }

  // Signa upp sig / lämna en Familjen-uppgift (2026-08-01, ersätter samma
  // dags tidigare claim-mekanism efter Zaidas rättelse: "samma gester...
  // som todovyn" — dubbeltryck öppnar samma "vem håller på med den
  // här"-väljare som lokalt, se FamilyTodoThreads.tsx).
  function toggleCrossAccountInProgress(accountId: Id, todoId: Id, targetMemberId: Id) {
    setThreads((current) =>
      current.map((thread) => {
        if (thread.accountId !== accountId) return thread;
        return {
          ...thread,
          todos: thread.todos.map((t) => {
            if (t.id !== todoId) return t;
            const already = (t.inProgressBy ?? []).includes(targetMemberId);
            const nextList = already
              ? (t.inProgressBy ?? []).filter((id) => id !== targetMemberId)
              : [...(t.inProgressBy ?? []), targetMemberId];
            return { ...t, inProgressBy: nextList, inProgressSince: nextList.length > 0 ? t.inProgressSince ?? new Date().toISOString() : null };
          })
        };
      })
    );
    todosApi.toggleFamilyAcrossAccountsInProgress(accountId, todoId, targetMemberId).then(refresh).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  // Full CSV-import/uppdatering/radering riktad mot ETT AV MINA ANDRA konton
  // (2026-08-08, Zaidas önskemål: en "Familj"-kolumn som pekar på en familj
  // jag är medlem i ska routa raden dit istället för mitt eget konto) —
  // samma {ok:true}/{ok:false,error}-kontrakt som useTodosState.ts:s
  // createTodo/updateTodo/softDeleteTodo, så TodoImportExport.tsx:s
  // runImport kan hantera lokala och cross-account-rader enhetligt.
  function importCrossAccountTodo(accountId: Id, todo: Todo): Promise<ApiResult> {
    return todosApi.importFamilyAcrossAccounts(accountId, todo).then(
      () => {
        refresh();
        return { ok: true as const };
      },
      (error: unknown) => {
        console.error(error);
        return { ok: false as const, error };
      }
    );
  }

  function updateCrossAccountTodo(accountId: Id, todoId: Id, patch: Partial<Todo>): Promise<ApiResult> {
    return todosApi.updateFamilyAcrossAccounts(accountId, todoId, patch).then(
      () => {
        refresh();
        return { ok: true as const };
      },
      (error: unknown) => {
        console.error(error);
        return { ok: false as const, error };
      }
    );
  }

  function deleteCrossAccountTodo(accountId: Id, todoId: Id): Promise<ApiResult> {
    return todosApi.deleteFamilyAcrossAccounts(accountId, todoId).then(
      () => {
        refresh();
        return { ok: true as const };
      },
      (error: unknown) => {
        console.error(error);
        return { ok: false as const, error };
      }
    );
  }

  return {
    threads,
    completeCrossAccountTodo,
    createCrossAccountTodo,
    toggleCrossAccountInProgress,
    importCrossAccountTodo,
    updateCrossAccountTodo,
    deleteCrossAccountTodo
  };
}

// Hem-vyns familjefilter (2026-07-31, Zaidas önskemål: "om jag väljer en
// familj, då vill jag att endast den familjens... medlemmar visas") — bara
// en läsbar sammanfattning (samma grupperade form som threads ovan), ingen
// mutation behövs härifrån.
export function useCrossAccountMembers() {
  const [groups, setGroups] = useState<FamilyMembersGroup[]>([]);
  useEffect(() => {
    membersApi.getCrossAccountMembers().then((data) => setGroups(Array.isArray(data) ? data : [])).catch(console.error);
  }, []);
  return groups;
}

// Mina familjekonton (2026-08-01, Zaidas önskemål: "samma gäller
// inköpslistan", rättad senare samma dag: "man ska inte kunna göra
// inköpslistor i familjer man inte är medlem i") — MEDVETET bara mina EGNA
// riktiga medlemskap, ingen Familjeanslutnings-variant (den stödjer bara
// läsning, se useConnectionShoppingLists i accounts/useFamilyConnectionsState.ts).
export function useCrossAccountShoppingLists() {
  const [groups, setGroups] = useState<CrossAccountShoppingLists[]>([]);

  const refresh = useCallback(() => {
    shoppingApi.getCrossAccountLists().then((data) => setGroups(Array.isArray(data) ? data : [])).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ownerId sätts alltid om server-side till min RIKTIGA medlemspost i
  // målkontot (createCrossAccountShoppingList/createList, samma
  // mass-assignment-skydd som ADR-0008) — värdet här är bara en platshållare
  // för att tillfredsställa ShoppingList-typen.
  function createCrossAccountList(accountId: Id, name: string, icon: string | null = null) {
    const newList: ShoppingList = {
      id: `shopping-${generateId()}`,
      name,
      ownerId: "",
      color: "#2f7d6d",
      icon,
      sharedWith: [],
      deletedAt: null,
      deletedBy: null,
      items: []
    };
    return shoppingApi.createCrossAccountList(accountId, newList).then(refresh);
  }

  // Redigera VAROR i en lista i ett av mina andra konton (2026-08-16, Zaidas
  // önskemål: "Listor måste gå att redigera i familjens listvy") — samma
  // optimistiska mönster som SharedShoppingLists.tsx:s useSharedShoppingLists.
  // createdBy nedan är bara en lokal platshållare (servern sätter alltid om
  // det till min RIKTIGA medlemspost i målkontot, samma resonemang som
  // createCrossAccountList ovan) — currentMember.id (mitt EGET kontos
  // medlems-id) skulle vara fel post i målkontot, men spelar ingen roll
  // eftersom refresh() synkar det korrekta värdet direkt efteråt.
  function updateItem(accountId: Id, listId: Id, mutate: (items: ShoppingList["items"]) => ShoppingList["items"]) {
    setGroups((current) =>
      current.map((group) =>
        group.accountId !== accountId
          ? group
          : { ...group, lists: group.lists.map((list) => (list.id !== listId ? list : { ...list, items: mutate(list.items) })) }
      )
    );
  }

  function addItem(accountId: Id, listId: Id, title: string, memberId: Id) {
    const newItem = {
      id: `shopping-item-${generateId()}`,
      title,
      createdBy: memberId,
      done: false,
      deletedAt: null,
      deletedBy: null
    };
    updateItem(accountId, listId, (items) => [...items, newItem]);
    shoppingApi.addCrossAccountItem(accountId, listId, newItem).then(refresh).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  function toggleItem(accountId: Id, listId: Id, itemId: Id) {
    updateItem(accountId, listId, (items) => items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)));
    shoppingApi.toggleCrossAccountItem(accountId, listId, itemId).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  function removeItem(accountId: Id, listId: Id, itemId: Id) {
    updateItem(accountId, listId, (items) => items.filter((item) => item.id !== itemId));
    shoppingApi.removeCrossAccountItem(accountId, listId, itemId).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  return { groups, createCrossAccountList, addItem, toggleItem, removeItem };
}

// Mina familjekonton — recept (2026-08-01, Zaidas önskemål, för måltids-
// planeringens skull), samma "bara läsbar sammanfattning"-princip som
// useCrossAccountMembers ovan.
export function useCrossAccountRecipes() {
  const [groups, setGroups] = useState<CrossAccountRecipes[]>([]);
  useEffect(() => {
    recipesApi.getCrossAccountRecipes().then((data) => setGroups(Array.isArray(data) ? data : [])).catch(console.error);
  }, []);
  return groups;
}

export function useMyMemberships(currentMemberId: Id, hiddenCrossAccountIds: Id[], onUpdateHidden: (memberId: Id, hiddenCrossAccountIds: Id[]) => void) {
  const [memberships, setMemberships] = useState<MyMembership[]>([]);
  // Radera/överlåt/gå ur (2026-07-29) — medlemslistan per konto hämtas bara
  // on-demand (när raden fälls ut i UI:t), cachas här per accountId.
  const [membersByAccount, setMembersByAccount] = useState<Record<Id, MembershipMemberSummary[]>>({});

  const refresh = useCallback(() => {
    membersApi.getMyMemberships().then(setMemberships).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function toggleAccountVisible(accountId: Id, visible: boolean) {
    const hidden = new Set(hiddenCrossAccountIds);
    if (visible) {
      hidden.delete(accountId);
    } else {
      hidden.add(accountId);
    }
    onUpdateHidden(currentMemberId, [...hidden]);
  }

  async function loadMembers(accountId: Id) {
    const list = await membersApi.getMembershipMembers(accountId);
    setMembersByAccount((current) => ({ ...current, [accountId]: list }));
    return list;
  }

  async function leaveAccount(accountId: Id) {
    await membersApi.leaveMembership(accountId);
    refresh();
  }

  async function transferOwnership(accountId: Id, newOwnerMemberId: Id) {
    await accountsApi.transferOwnership(accountId, newOwnerMemberId);
    refresh();
  }

  async function deleteCreatedAccount(accountId: Id) {
    await accountsApi.deleteAsCreator(accountId);
    refresh();
  }

  return {
    memberships,
    toggleAccountVisible,
    membersByAccount,
    loadMembers,
    leaveAccount,
    transferOwnership,
    deleteCreatedAccount
  };
}
