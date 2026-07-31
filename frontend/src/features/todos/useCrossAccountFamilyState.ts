import { useCallback, useEffect, useState } from "react";
import { accountsApi, membersApi, todosApi } from "../../api";
import type { CrossAccountFamilyThread, FamilyMembersGroup, Id, MembershipMemberSummary, MyMembership } from "@shared/types";

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

  return { threads, completeCrossAccountTodo };
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
