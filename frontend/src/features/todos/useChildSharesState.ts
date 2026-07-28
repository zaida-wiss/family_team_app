import { useCallback, useEffect, useState } from "react";
import { membersApi, todosApi } from "../../api";
import type { ChildShare, ChildShareCandidate } from "../../api/members";
import type { SharedChildData } from "../../api/todos";
import type { AccessLevel, Id } from "@shared/types";

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22). Två skilda hooks för två skilda vyer: bollarna för barn som
// DELATS MED mig (useSharedChildrenTodos, används i tråd-vyn) och
// hanteringen av VEM JAG delar MINA egna barn med (useChildShareManagement,
// används i Inställningar → Barn).

export function useSharedChildrenTodos() {
  const [sharedChildren, setSharedChildren] = useState<SharedChildData[]>([]);

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

// 2026-07-28, Zaidas önskemål: "det ska stå bekräftat vilka barn man delar
// med vem och vilka behörigheter de har... man ska även kunna välja flera
// barn på en gång" — hanterar nu ALLA barn samtidigt (inte ett i taget):
// shares aggregeras över samtliga childIds till en enda lista (taggad med
// vilket barn varje delning gäller), och grant() kan bevilja SAMMA mottagare
// åtkomst till FLERA valda barn i en enda åtgärd (ett API-anrop per barn,
// samma "en todo per mottagare"-mönster som CSV-importen redan använder).
export function useChildShareManagement(childIds: Id[]) {
  const [sharesByChild, setSharesByChild] = useState<Record<Id, ChildShare[]>>({});
  const [candidates, setCandidates] = useState<ChildShareCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const childIdsKey = childIds.join(",");

  const refresh = useCallback(() => {
    if (childIds.length === 0) {
      setSharesByChild({});
      return;
    }
    Promise.all(childIds.map((id) => membersApi.listShares(id).then((shares) => [id, shares] as const)))
      .then((entries) => setSharesByChild(Object.fromEntries(entries)))
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childIdsKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function clearCandidates() {
    setCandidates(null);
  }

  // Sökningen (e-post → kandidat-medlemskap) beror inte på VILKET barn den
  // görs mot — anropet kräver bara en giltig, hanterbar childId som ankare.
  async function lookup(email: string) {
    const anchorChildId = childIds[0];
    if (!anchorChildId) return;
    setLoading(true);
    try {
      const result = await membersApi.lookupShareCandidate(anchorChildId, email);
      setCandidates(result.memberships);
    } finally {
      setLoading(false);
    }
  }

  async function grant(candidate: ChildShareCandidate, access: AccessLevel, targetChildIds: Id[]) {
    if (targetChildIds.length === 0) return;
    await Promise.all(
      targetChildIds.map((id) => membersApi.shareChild(id, candidate.memberId, candidate.accountId, access))
    );
    setCandidates(null);
    refresh();
  }

  async function revoke(childId: Id, share: ChildShare) {
    await membersApi.revokeShare(childId, share.accountId, share.memberId);
    refresh();
  }

  return { sharesByChild, candidates, loading, lookup, grant, revoke, clearCandidates };
}

// Överför ett barn permanent till en annan familj (2026-07-27, Zaidas
// önskemål: "jag ska även kunna... överföra dem till andra familjer") —
// samma e-postuppslag som delning (membersApi.lookupShareCandidate), men
// oåterkalleligt: hela medlemskapet flyttas, inte en revocerbar åtkomst-
// grant. Egen hook, egen candidates-lista — att blanda ihop delnings- och
// överförings-kandidater i samma state hade riskerat att en knapp av
// misstag utförde fel operation.
export function useChildTransfer(childId: Id | null) {
  const [candidates, setCandidates] = useState<ChildShareCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);

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

  async function transfer(candidate: ChildShareCandidate) {
    if (!childId) return;
    setTransferring(true);
    try {
      await membersApi.transferChild(childId, candidate.memberId, candidate.accountId);
      setCandidates(null);
    } finally {
      setTransferring(false);
    }
  }

  return { candidates, loading, transferring, lookup, transfer, clearCandidates };
}
