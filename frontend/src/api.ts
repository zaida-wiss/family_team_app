import type { Account, Calendar, Member, Reward, Role, ShoppingList, Todo } from "@shared/types";

let currentMemberId: string | null = null;

export function setApiMemberId(memberId: string) {
  currentMemberId = memberId;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(currentMemberId ? { "x-member-id": currentMemberId } : {})
  };

  const response = await fetch(path, { ...options, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// --- Members ---
export const membersApi = {
  getAll: () => request<Member[]>("/api/members"),
  create: (member: Member) => request<{ id: string }>("/api/members", { method: "POST", body: JSON.stringify(member) }),
  update: (id: string, patch: Partial<Member>) => request<{ ok: boolean }>(`/api/members/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/members/${id}`, { method: "DELETE" }),
  restore: (id: string) => request<{ ok: boolean }>(`/api/members/${id}/restore`, { method: "PATCH", body: JSON.stringify({}) })
};

// --- Roles ---
export const rolesApi = {
  getAll: () => request<Role[]>("/api/roles"),
  create: (role: Role) => request<{ id: string }>("/api/roles", { method: "POST", body: JSON.stringify(role) }),
  updatePermissions: (id: string, permissions: Role["permissions"]) =>
    request<{ ok: boolean }>(`/api/roles/${id}/permissions`, { method: "PATCH", body: JSON.stringify(permissions) })
};

// --- Accounts ---
export const accountsApi = {
  get: (id: string) => request<Account>(`/api/accounts/${id}`),
  update: (id: string, patch: Partial<Account>) => request<{ ok: boolean }>(`/api/accounts/${id}`, { method: "PUT", body: JSON.stringify(patch) })
};

// --- Todos ---
export const todosApi = {
  getAll: () => request<Todo[]>("/api/todos"),
  create: (todo: Todo) => request<{ id: string }>("/api/todos", { method: "POST", body: JSON.stringify(todo) }),
  complete: (id: string) => request<{ ok: boolean }>(`/api/todos/${id}/complete`, { method: "PATCH", body: JSON.stringify({}) }),
  approve: (id: string) => request<{ ok: boolean }>(`/api/todos/${id}/approve`, { method: "PATCH", body: JSON.stringify({}) }),
  reject: (id: string) => request<{ ok: boolean }>(`/api/todos/${id}/reject`, { method: "PATCH", body: JSON.stringify({}) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/todos/${id}`, { method: "DELETE" }),
  restore: (id: string) => request<{ ok: boolean }>(`/api/todos/${id}/restore`, { method: "PATCH", body: JSON.stringify({}) })
};

// --- Calendars ---
export const calendarsApi = {
  getAll: () => request<Calendar[]>("/api/calendars"),
  create: (calendar: Calendar) => request<{ id: string }>("/api/calendars", { method: "POST", body: JSON.stringify(calendar) }),
  addEvent: (calendarId: string, event: Calendar["events"][number]) =>
    request<{ ok: boolean }>(`/api/calendars/${calendarId}/events`, { method: "POST", body: JSON.stringify(event) }),
  share: (calendarId: string, memberId: string, access: string) =>
    request<{ ok: boolean }>(`/api/calendars/${calendarId}/share`, { method: "POST", body: JSON.stringify({ memberId, access }) }),
  unshare: (calendarId: string, memberId: string) =>
    request<{ ok: boolean }>(`/api/calendars/${calendarId}/share/${memberId}`, { method: "DELETE" }),
  importEvents: (calendarId: string, source: object, events: object[]) =>
    request<{ ok: boolean }>(`/api/calendars/${calendarId}/import`, { method: "POST", body: JSON.stringify({ source, events }) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/calendars/${id}`, { method: "DELETE" }),
  restore: (id: string) => request<{ ok: boolean }>(`/api/calendars/${id}/restore`, { method: "PATCH", body: JSON.stringify({}) })
};

// --- Shopping ---
export const shoppingApi = {
  getAll: () => request<ShoppingList[]>("/api/shopping"),
  create: (list: ShoppingList) => request<{ id: string }>("/api/shopping", { method: "POST", body: JSON.stringify(list) }),
  addItem: (listId: string, item: ShoppingList["items"][number]) =>
    request<{ ok: boolean }>(`/api/shopping/${listId}/items`, { method: "POST", body: JSON.stringify(item) }),
  toggleItem: (listId: string, itemId: string) =>
    request<{ ok: boolean }>(`/api/shopping/${listId}/items/${itemId}/toggle`, { method: "PATCH", body: JSON.stringify({}) }),
  share: (listId: string, memberId: string, access: string) =>
    request<{ ok: boolean }>(`/api/shopping/${listId}/share`, { method: "POST", body: JSON.stringify({ memberId, access }) }),
  unshare: (listId: string, memberId: string) =>
    request<{ ok: boolean }>(`/api/shopping/${listId}/share/${memberId}`, { method: "DELETE" }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/shopping/${id}`, { method: "DELETE" }),
  restore: (id: string) => request<{ ok: boolean }>(`/api/shopping/${id}/restore`, { method: "PATCH", body: JSON.stringify({}) })
};

// --- Rewards ---
export const rewardsApi = {
  getAll: () => request<Reward[]>("/api/rewards"),
  create: (reward: Reward) => request<{ id: string }>("/api/rewards", { method: "POST", body: JSON.stringify(reward) }),
  approve: (id: string, starsNeeded: number) =>
    request<{ ok: boolean }>(`/api/rewards/${id}/approve`, { method: "PATCH", body: JSON.stringify({ starsNeeded }) }),
  reject: (id: string) => request<{ ok: boolean }>(`/api/rewards/${id}/reject`, { method: "PATCH", body: JSON.stringify({}) }),
  redeem: (id: string) => request<{ ok: boolean }>(`/api/rewards/${id}/redeem`, { method: "PATCH", body: JSON.stringify({}) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/rewards/${id}`, { method: "DELETE" })
};
