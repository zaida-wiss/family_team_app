import type {
  AccessLevel,
  CalendarEvent,
  CrossAccountFamilyThread,
  PaginatedTodos,
  PurchasedReward,
  TimedTaskWithBest,
  Todo
} from "@shared/types";

// Familjeanslutningar (ADR-0030, 2026-07-29).
export type ConnectionTodosThread = {
  accountId: string;
  accountName: string;
  access: AccessLevel;
  todos: Todo[];
};

// Delade EGNA kategorier (2026-08-06, Zaidas önskemål: "det skall vara
// möjligt att dela sina egna kategorier med utvalda familjer") — en tråd
// per kategori som delats MED mig, skiljer sig från getSharedChildren (ett
// helt barn) och getConnectionTodos (en hel Familjeanslutning) ovan.
export type SharedCategoryThread = {
  category: { id: string; accountId: string; name: string; accountName: string; sharedByName: string };
  access: AccessLevel;
  todos: Todo[];
};
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

// Svarsformen för samtliga complete-endpoints (2026-08-09, Zaidas önskemål:
// "skulle det kunna komma en pokal med tiden över skärmen då?") — isNewRecord
// speglar backendens redan uträknade personbästa-koll (todosService.ts:s
// recordAutoTimedAttempt), tidigare bara kastad bort efter beräkning.
export type CompleteTodoResponse = { ok: boolean; isNewRecord: boolean };

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
    request<CompleteTodoResponse>(api(`todos/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({ elapsedMs })
    }),
  uncomplete: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/uncomplete`), {
      method: "PATCH",
      body: JSON.stringify({})
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
  // Samma ADR-0025-undantag, per rad (2026-08-05) — se TrashView.tsx.
  purge: (id: string) => request<{ ok: boolean }>(api(`todos/${id}/purge`), { method: "DELETE" }),
  // Historik/papperskorg, paginerad (2026-07-26) — se todosService.ts:s
  // getTodosHistoryPage. GET /api/todos ovan returnerar inte längre
  // mjuk-raderade todos alls (var tidigare kvar 30 dagar).
  getHistoryPage: (page: number, pageSize: number) =>
    request<PaginatedTodos>(api(`todos/history?page=${page}&pageSize=${pageSize}`)),
  // Statistik-underlag för FamilyCompletedTimeline.tsx (2026-08-15) — se
  // backend-routens kommentar för varför ett eget, 14-dagars fönster.
  getCompletedStats: () => request<string[]>(api("todos/completed-stats")),
  // Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024) —
  // utökad till allt kopplat till barnets konto, se SharedChildData ovan.
  getSharedChildren: () => request<SharedChildData[]>(api("todos/shared-children")),
  completeShared: (
    childAccountId: string,
    childMemberId: string,
    id: string,
    elapsedMs: number | null = null
  ) =>
    request<CompleteTodoResponse>(api(`todos/shared/${childAccountId}/${childMemberId}/${id}/complete`), {
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
    request<CompleteTodoResponse>(api(`todos/family-across-accounts/${targetAccountId}/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({ elapsedMs })
    }),
  // Lägg till en ny Familjen-uppgift "förinställd på familjen" (2026-08-01,
  // Zaidas önskemål) direkt i ETT AV MINA ANDRA konton.
  createFamilyAcrossAccounts: (targetAccountId: string, title: string, visual: string | null = null) =>
    request<{ id: string }>(api(`todos/family-across-accounts/${targetAccountId}`), {
      method: "POST",
      body: JSON.stringify({ title, visual })
    }),
  // Signa upp sig / lämna en Familjen-uppgift i ETT AV MINA ANDRA konton
  // (2026-08-01, ersätter samma dags tidigare claim-mekanism — Zaidas
  // rättelse: samma "vem håller på med den här"-dubbeltryck som lokalt).
  toggleFamilyAcrossAccountsInProgress: (targetAccountId: string, id: string, targetMemberId: string) =>
    request<{ inProgressBy: string[]; inProgressSince: string | null }>(
      api(`todos/family-across-accounts/${targetAccountId}/${id}/in-progress`),
      { method: "PATCH", body: JSON.stringify({ targetMemberId }) }
    ),
  // Full CSV-import/uppdatering/radering riktad mot ETT AV MINA ANDRA konton
  // (2026-08-08, Zaidas önskemål: en "Familj"-kolumn som pekar på en familj
  // jag är medlem i ska routa raden dit istället för mitt eget konto) —
  // till skillnad från createFamilyAcrossAccounts ovan (bara titel+emoji)
  // skickar denna en FULLSTÄNDIG Todo, samma form som den vanliga
  // create/update ovan.
  importFamilyAcrossAccounts: (targetAccountId: string, todo: Todo) =>
    request<{ id: string }>(api(`todos/family-across-accounts/${targetAccountId}/import`), {
      method: "POST",
      body: JSON.stringify(todo)
    }),
  updateFamilyAcrossAccounts: (targetAccountId: string, id: string, patch: Partial<Todo>) =>
    request<{ ok: boolean }>(api(`todos/family-across-accounts/${targetAccountId}/${id}/import`), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  deleteFamilyAcrossAccounts: (targetAccountId: string, id: string) =>
    request<{ ok: boolean }>(api(`todos/family-across-accounts/${targetAccountId}/${id}/import`), {
      method: "DELETE"
    }),
  // Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
  // familjemedlemmar"), skiljer sig från getSharedChildren (ett helt barn)
  // och getFamilyAcrossAccounts (ett riktigt medlemskap) ovan.
  getConnectionTodos: () => request<ConnectionTodosThread[]>(api("todos/connections")),
  completeConnectionTodo: (targetAccountId: string, id: string, elapsedMs: number | null = null) =>
    request<CompleteTodoResponse>(api(`todos/connections/${targetAccountId}/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({ elapsedMs })
    }),
  approveConnectionTodo: (targetAccountId: string, id: string) =>
    request<{ ok: boolean }>(api(`todos/connections/${targetAccountId}/${id}/approve`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  rejectConnectionTodo: (targetAccountId: string, id: string, reason: string | null) =>
    request<{ ok: boolean }>(api(`todos/connections/${targetAccountId}/${id}/reject`), {
      method: "PATCH",
      body: JSON.stringify({ reason })
    }),
  // Lägg till en ny Familjen-uppgift i en ANSLUTEN familjs konto
  // (2026-08-01), kräver redigera-åtkomst i anslutningen.
  createConnectionTodo: (targetAccountId: string, title: string, visual: string | null = null) =>
    request<{ id: string }>(api(`todos/connections/${targetAccountId}`), {
      method: "POST",
      body: JSON.stringify({ title, visual })
    }),
  // Delade EGNA kategorier (2026-08-06) — se SharedCategoryThread ovan.
  getSharedCategories: () => request<SharedCategoryThread[]>(api("todos/shared-categories")),
  completeSharedCategory: (categoryAccountId: string, id: string, elapsedMs: number | null = null) =>
    request<CompleteTodoResponse>(api(`todos/shared-categories/${categoryAccountId}/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({ elapsedMs })
    }),
  toggleSharedCategorySubtask: (categoryAccountId: string, id: string, subtaskId: string) =>
    request<{ done: boolean }>(api(`todos/shared-categories/${categoryAccountId}/${id}/subtasks/${subtaskId}`), {
      method: "PATCH",
      body: JSON.stringify({})
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
