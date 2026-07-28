import type {
  AccessLevel,
  CalendarEvent,
  CrossAccountFamilyThread,
  PaginatedTodos,
  PurchasedReward,
  TimedTaskWithBest,
  Todo
} from "@shared/types";
import { api, request, subscribeToServerEvents } from "./client";

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024) —
// utökad 2026-07-27 (Zaidas önskemål: "åtkomst till allt som är kopplat
// till barnets konto") till även kalender/belöningar/Medaljer, inte bara
// todos. Bara todos har en mutation (completeShared, se nedan) — resten är
// medvetet läsbart i denna första version, samma princip som redan gäller
// för todos (godkännande/stjärnor sker bara i barnets EGET konto).
export type SharedChildData = {
  child: {
    id: string;
    accountId: string;
    name: string;
    avatarUrl: string | null;
    color: string | null;
    dashboardTheme: string | null;
  };
  access: AccessLevel;
  // Placeringsbeslut (2026-07-29): barnet visas i Familjemedlemmar, denna
  // text under namnet informerar om varifrån det delas.
  homeAccountName: string;
  relation: string | null;
  todos: Todo[];
  calendarEvents: (CalendarEvent & { calendarName: string })[];
  purchasedRewards: PurchasedReward[];
  stars: { approved: number; spent: number };
  timedTasks: TimedTaskWithBest[];
};

export const todosApi = {
  getAll: () => request<Todo[]>(api("todos")),
  create: (todo: Todo) =>
    request<{ id: string }>(api("todos"), { method: "POST", body: JSON.stringify(todo) }),
  update: (id: string, patch: Partial<Todo>) =>
    request<{ ok: boolean }>(api(`todos/${id}`), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  complete: (id: string, elapsedMs: number | null = null) =>
    request<{ ok: boolean }>(api(`todos/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({ elapsedMs })
    }),
  approve: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/approve`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  reject: (id: string, reason: string | null) =>
    request<{ ok: boolean }>(api(`todos/${id}/reject`), {
      method: "PATCH",
      body: JSON.stringify({ reason })
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}`), { method: "DELETE" }),
  toggleSubtask: (id: string, subtaskId: string) =>
    request<{ done: boolean }>(api(`todos/${id}/subtasks/${subtaskId}`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  toggleInProgress: (id: string, targetMemberId: string) =>
    request<{ inProgressBy: string[]; inProgressSince: string | null }>(api(`todos/${id}/in-progress`), {
      method: "PATCH",
      body: JSON.stringify({ targetMemberId })
    }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av papperskorgen.
  purgeTrash: () =>
    request<{ ok: boolean }>(api("todos/purge-trash"), { method: "POST", body: JSON.stringify({}) }),
  // Historik/papperskorg, paginerad (2026-07-26) — se todosService.ts:s
  // getTodosHistoryPage. GET /api/todos ovan returnerar inte längre
  // mjuk-raderade todos alls (var tidigare kvar 30 dagar).
  getHistoryPage: (page: number, pageSize: number) =>
    request<PaginatedTodos>(api(`todos/history?page=${page}&pageSize=${pageSize}`)),
  // Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024) —
  // utökad till allt kopplat till barnets konto, se SharedChildData ovan.
  getSharedChildren: () => request<SharedChildData[]>(api("todos/shared-children")),
  completeShared: (
    childAccountId: string,
    childMemberId: string,
    id: string,
    elapsedMs: number | null = null
  ) =>
    request<{ ok: boolean }>(api(`todos/shared/${childAccountId}/${childMemberId}/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({ elapsedMs })
    }),
  // Godkänn/neka på ett delat barns todos (2026-07-29, Zaidas beslut: "full
  // åtkomst, som en riktig förälder") — kräver "edit"-åtkomst, samma spärr
  // som completeShared.
  approveShared: (childAccountId: string, childMemberId: string, id: string) =>
    request<{ ok: boolean }>(api(`todos/shared/${childAccountId}/${childMemberId}/${id}/approve`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  rejectShared: (childAccountId: string, childMemberId: string, id: string, reason: string | null) =>
    request<{ ok: boolean }>(api(`todos/shared/${childAccountId}/${childMemberId}/${id}/reject`), {
      method: "PATCH",
      body: JSON.stringify({ reason })
    }),
  // Mina familjekonton (2026-07-25) — mina EGNA andra medlemskap, inte en
  // delnings-grant (skiljer sig från getSharedChildren ovan).
  getFamilyAcrossAccounts: () => request<CrossAccountFamilyThread[]>(api("todos/family-across-accounts")),
  completeFamilyAcrossAccounts: (targetAccountId: string, id: string, elapsedMs: number | null = null) =>
    request<{ ok: boolean }>(api(`todos/family-across-accounts/${targetAccountId}/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({ elapsedMs })
    }),
  subscribeToChanges: (onChange: () => void) => {
    let initialConnect = true;
    return subscribeToServerEvents(api("todos/events"), (eventName) => {
      if (eventName === "todos-changed") {
        onChange();
      } else if (eventName === "connected") {
        // Hoppa över den allra första anslutningen — initial fetch sker redan i useTodosState
        if (initialConnect) { initialConnect = false; return; }
        onChange();
      }
    });
  }
};
