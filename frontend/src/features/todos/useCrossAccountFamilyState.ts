import { useCallback, useEffect, useState } from "react";
import { accountsApi, membersApi, todosApi } from "../../api";
import type { CrossAccountFamilyThread, Id, MembershipMemberSummary, MyMembership } from "@shared/types";

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
    todosApi.getFamilyAcrossAccounts().then(setThreads).catch(console.error);
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

  return { threads, completeCrossAccountTodo };
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
