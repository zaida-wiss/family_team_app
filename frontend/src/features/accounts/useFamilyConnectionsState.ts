import { useCallback, useEffect, useState } from "react";
import { accountsApi, calendarsApi, recipesApi, shoppingApi, todosApi } from "../../api";
import type { ConnectionRecipes } from "../../api/recipes";
import type { ConnectionShoppingLists } from "../../api/shopping";
import type { ConnectionTodosThread } from "../../api/todos";
import type {
  FamilyConnectionCandidate,
  MyFamilyConnections,
  PendingFamilyConnection
} from "../../api/accounts";
import type { AccessLevel, CrossAccountCalendar, FamilyConnectionScope } from "@shared/types";

// Familjeanslutningar (ADR-0030, 2026-07-29, Zaidas rättelse: "det är
// endast hemvyn som skall gå att växla mellan olika familjer... Däremot
// läggs det till uppgifter, recept, inköpslistor som tillhör de familjer
// du valt att visa"). Den LÄTTA formen — ger INTE kontoåtkomst/medlemskap,
// bara extra sektioner i Todos-/Recept-/Inköpslistor-panelerna. Inställningar
// → Familjeanslutningar hanterar skicka/väntande/aktiva; de tre panel-
// hookarna nedan (useConnectionTodos/Recipes/ShoppingLists) hämtar bara den
// exponerade DATAN.

export function useFamilyConnectionManagement(accountId: string) {
  const [connections, setConnections] = useState<MyFamilyConnections>({ exposedByMe: [], exposedToMe: [] });
  const [pending, setPending] = useState<PendingFamilyConnection[]>([]);
  const [candidates, setCandidates] = useState<FamilyConnectionCandidate[] | null>(null);

  const refresh = useCallback(() => {
    accountsApi.getMyConnections(accountId).then(setConnections).catch(console.error);
    accountsApi.getPendingConnections(accountId).then(setPending).catch(console.error);
  }, [accountId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function lookup(email: string) {
    accountsApi
      .lookupConnectionCandidate(accountId, email)
      .then((res) => setCandidates(res.accounts))
      .catch(console.error);
  }

  function clearCandidates() {
    setCandidates(null);
  }

  async function invite(
    otherAccountId: string,
    exposedMemberIds: string[],
    access: AccessLevel,
    dataScope: Partial<FamilyConnectionScope>
  ) {
    await accountsApi.sendConnectionInvitation(accountId, otherAccountId, exposedMemberIds, access, dataScope);
    clearCandidates();
    refresh();
  }

  async function accept(
    fromAccountId: string,
    exposedMemberIds: string[],
    access: AccessLevel,
    dataScope: Partial<FamilyConnectionScope>
  ) {
    await accountsApi.acceptConnection(accountId, fromAccountId, exposedMemberIds, access, dataScope);
    refresh();
  }

  async function decline(fromAccountId: string) {
    await accountsApi.declineConnection(accountId, fromAccountId);
    refresh();
  }

  async function revoke(connectionId: string) {
    await accountsApi.revokeConnection(accountId, connectionId);
    refresh();
  }

  return { connections, pending, candidates, lookup, clearCandidates, invite, accept, decline, revoke };
}

export function useConnectionTodos() {
  const [threads, setThreads] = useState<ConnectionTodosThread[]>([]);

  const refresh = useCallback(() => {
    todosApi.getConnectionTodos().then(setThreads).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => todosApi.subscribeToChanges(refresh), [refresh]);

  function completeConnectionTodo(accountId: string, todoId: string) {
    todosApi.completeConnectionTodo(accountId, todoId).then(refresh).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  function approveConnectionTodo(accountId: string, todoId: string) {
    todosApi.approveConnectionTodo(accountId, todoId).then(refresh).catch(console.error);
  }

  function rejectConnectionTodo(accountId: string, todoId: string, reason: string | null) {
    todosApi.rejectConnectionTodo(accountId, todoId, reason).then(refresh).catch(console.error);
  }

  return { threads, completeConnectionTodo, approveConnectionTodo, rejectConnectionTodo };
}

export function useConnectionRecipes() {
  const [groups, setGroups] = useState<ConnectionRecipes[]>([]);
  useEffect(() => {
    recipesApi.getConnectionRecipes().then(setGroups).catch(console.error);
  }, []);
  return groups;
}

export function useConnectionShoppingLists() {
  const [groups, setGroups] = useState<ConnectionShoppingLists[]>([]);
  useEffect(() => {
    shoppingApi.getConnectionLists().then(setGroups).catch(console.error);
  }, []);
  return groups;
}

export function useConnectionCalendars() {
  const [groups, setGroups] = useState<CrossAccountCalendar[]>([]);
  useEffect(() => {
    calendarsApi.getConnectionCalendars().then(setGroups).catch(console.error);
  }, []);
  return groups;
}
