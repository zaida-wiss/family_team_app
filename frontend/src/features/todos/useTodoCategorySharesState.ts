import { useCallback, useEffect, useState } from "react";
import { todosApi, type SharedCategoryThread } from "../../api/todos";
import { todoCategoriesApi, type TodoCategoryShare, type TodoCategoryShareCandidate } from "../../api/todoCategories";
import type { AccessLevel, Id } from "@shared/types";

// Dela en EGEN kategori med en annan familj, icke-transitivt (2026-08-06,
// Zaidas önskemål: "det skall vara möjligt att dela sina egna kategorier
// med utvalda familjer") — samma tvådelade mönster som
// useShoppingSharesState.ts (ADR-0026): en hook för kategorier som DELATS
// MED mig (useSharedCategoryTodos, se Hem-vyns Todos-flik) och en för
// hanteringen av VEM JAG delar en EGEN kategori med (useCategoryShareManagement,
// öppnas via "Dela" i kategorimenyn, ParentTodoThreadView.tsx).

export function useSharedCategoryTodos() {
  const [threads, setThreads] = useState<SharedCategoryThread[]>([]);

  const refresh = useCallback(() => {
    todosApi.getSharedCategories().then(setThreads).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function completeTodo(categoryAccountId: Id, todoId: Id) {
    setThreads((current) =>
      current.map((entry) =>
        entry.category.accountId !== categoryAccountId
          ? entry
          : { ...entry, todos: entry.todos.filter((t) => t.id !== todoId) }
      )
    );
    todosApi.completeSharedCategory(categoryAccountId, todoId).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  function toggleSubtask(categoryAccountId: Id, todoId: Id, subtaskId: Id) {
    setThreads((current) =>
      current.map((entry) =>
        entry.category.accountId !== categoryAccountId
          ? entry
          : {
              ...entry,
              todos: entry.todos.map((t) =>
                t.id !== todoId
                  ? t
                  : { ...t, subtasks: t.subtasks?.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)) }
              )
            }
      )
    );
    todosApi.toggleSharedCategorySubtask(categoryAccountId, todoId, subtaskId).catch((error) => {
      console.error(error);
      refresh();
    });
  }

  return { threads, refresh, completeTodo, toggleSubtask };
}

export function useCategoryShareManagement(categoryId: Id | null) {
  const [shares, setShares] = useState<TodoCategoryShare[]>([]);
  const [candidates, setCandidates] = useState<TodoCategoryShareCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!categoryId) {
      setShares([]);
      return;
    }
    todoCategoriesApi.listExternalShares(categoryId).then(setShares).catch(console.error);
  }, [categoryId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function clearCandidates() {
    setCandidates(null);
  }

  async function lookup(email: string) {
    if (!categoryId) return;
    setLoading(true);
    try {
      const result = await todoCategoriesApi.lookupExternalShareCandidate(categoryId, email);
      setCandidates(result.memberships);
    } finally {
      setLoading(false);
    }
  }

  async function grant(candidate: TodoCategoryShareCandidate, access: AccessLevel) {
    if (!categoryId) return;
    await todoCategoriesApi.shareCategoryExternally(categoryId, candidate.memberId, candidate.accountId, access);
    setCandidates(null);
    refresh();
  }

  async function revoke(share: TodoCategoryShare) {
    if (!categoryId) return;
    await todoCategoriesApi.revokeExternalShare(categoryId, share.accountId, share.memberId);
    refresh();
  }

  return { shares, candidates, loading, lookup, grant, revoke, clearCandidates };
}
