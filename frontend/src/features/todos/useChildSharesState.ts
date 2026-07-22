import { useCallback, useEffect, useState } from "react";
import { membersApi, todosApi } from "../../api";
import type { ChildShare, ChildShareCandidate } from "../../api/members";
import type { SharedChildTodos } from "../../api/todos";
import type { AccessLevel, Id } from "@shared/types";

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22). Två skilda hooks för två skilda vyer: bollarna för barn som
// DELATS MED mig (useSharedChildrenTodos, används i tråd-vyn) och
// hanteringen av VEM JAG delar MINA egna barn med (useChildShareManagement,
// används i Inställningar → Barn).

export function useSharedChildrenTodos() {
  const [sharedChildren, setSharedChildren] = useState<SharedChildTodos[]>([]);

  const refresh = useCallback(() => {
    todosApi.getSharedChildren().then(setSharedChildren).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Samma SSE-kanal som vanliga todos — completeSharedChildTodo (backend)
  // anropar samma broadcastTodosChanged() som alla andra todo-mutationer.
  useEffect(() => todosApi.subscribeToChanges(refresh), [refresh]);

  function completeSharedTodo(childAccountId: Id, childMemberId: Id, todoId: Id) {
    setSharedChildren((current) =>
      current.map((entry) =>
        entry.child.id !== childMemberId
          ? entry
          : { ...entry, todos: entry.todos.map((t) => (t.id === todoId ? { ...t, status: "done" as const } : t)) }
      )
    );
    todosApi.completeShared(childAccountId, childMemberId, todoId).then(refresh).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  return { sharedChildren, completeSharedTodo };
}

export function useChildShareManagement(childId: Id | null) {
  const [shares, setShares] = useState<ChildShare[]>([]);
  const [candidates, setCandidates] = useState<ChildShareCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!childId) {
      setShares([]);
      return;
    }
    membersApi.listShares(childId).then(setShares).catch(console.error);
  }, [childId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function clearCandidates() {
    setCandidates(null);
  }

  async function lookup(email: string) {
    if (!childId) return;
    setLoading(true);
    try {
      const result = await membersApi.lookupShareCandidate(childId, email);
      setCandidates(result.memberships);
    } finally {
      setLoading(false);
    }
  }

  async function grant(candidate: ChildShareCandidate, access: AccessLevel) {
    if (!childId) return;
    await membersApi.shareChild(childId, candidate.memberId, candidate.accountId, access);
    setCandidates(null);
    refresh();
  }

  async function revoke(share: ChildShare) {
    if (!childId) return;
    await membersApi.revokeShare(childId, share.accountId, share.memberId);
    refresh();
  }

  return { shares, candidates, loading, lookup, grant, revoke, clearCandidates };
}
