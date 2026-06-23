import type {
  Account,
  Calendar,
  Invitation,
  Member,
  Membership,
  Reward,
  Role,
  ShoppingList,
  Todo,
  User
} from "@shared/types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const api = (path: string) => `${API_BASE}/api/${path}`;

let accessToken: string | null = null;
let currentMemberId: string | null = null;
let onApiError: ((message: string) => void) | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setApiMemberId(memberId: string | null) {
  currentMemberId = memberId;
}

export function setApiErrorHandler(handler: (message: string) => void) {
  onApiError = handler;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(currentMemberId ? { "x-member-id": currentMemberId } : {})
  };

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers, credentials: "include" });
  } catch {
    const message = "Servern är inte nåbar";
    onApiError?.(message);
    throw new Error(message);
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");

  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error("Inte autentiserad");
  }

  if (!response.ok) {
    const body = isJson ? await response.json().catch(() => ({})) : {};
    const message = (body as { error?: string }).error ?? `HTTP ${response.status}`;
    onApiError?.(message);
    throw new Error(message);
  }

  if (!isJson) {
    const message = "Oväntat svar från servern";
    onApiError?.(message);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

type LoginResponse = { accessToken: string; user: User; memberships: Membership[] };
type RegisterResponse = { accessToken: string; user: User };

export const authApi = {
  register: (email: string, password: string, name: string) =>
    request<RegisterResponse>(api("auth/register"), {
      method: "POST",
      body: JSON.stringify({ email, password, name })
    }),
  login: (email: string, password: string) =>
    request<LoginResponse>(api("auth/login"), {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  refresh: () => request<LoginResponse>(api("auth/refresh"), { method: "POST", body: "{}" }),
  logout: () => request<{ ok: boolean }>(api("auth/logout"), { method: "POST", body: "{}" })
};

export const invitationsApi = {
  invite: (
    accountId: string,
    payload: { invitedEmail: string; memberName: string; roleId: string }
  ) =>
    request<{ invitation: Invitation; inviteUrl: string; accountName: string }>(
      api(`accounts/${accountId}/invite`),
      { method: "POST", body: JSON.stringify(payload) }
    ),
  get: (token: string) =>
    request<{ invitation: Invitation; account: Account; role: Role }>(
      api(`invitations/${token}`)
    ),
  accept: (
    token: string,
    payload:
      | { action: "register"; email: string; password: string; name: string }
      | { action: "login"; email: string; password: string }
  ) =>
    request<LoginResponse>(
      api(`invitations/${token}/accept`),
      { method: "POST", body: JSON.stringify(payload) }
    )
};

export const membersApi = {
  getAll: () => request<Member[]>(api("members")),
  create: (member: Member) =>
    request<{ id: string }>(api("members"), { method: "POST", body: JSON.stringify(member) }),
  update: (id: string, patch: Partial<Member>) =>
    request<{ ok: boolean }>(api(`members/${id}`), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`members/${id}`), { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`members/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    })
};

export const rolesApi = {
  getAll: () => request<Role[]>(api("roles")),
  create: (role: Role) =>
    request<{ id: string }>(api("roles"), { method: "POST", body: JSON.stringify(role) }),
  updatePermissions: (id: string, permissions: Role["permissions"]) =>
    request<{ ok: boolean }>(api(`roles/${id}/permissions`), {
      method: "PATCH",
      body: JSON.stringify(permissions)
    })
};

export const accountsApi = {
  setup: (name: string) =>
    request<{ membership: Membership }>(api("accounts/setup"), {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  get: (id: string) => request<Account>(api(`accounts/${id}`)),
  update: (id: string, patch: Partial<Account>) =>
    request<{ ok: boolean }>(api(`accounts/${id}`), { method: "PUT", body: JSON.stringify(patch) }),
  export: (id: string) =>
    request<unknown>(api(`accounts/${id}/export`)),
  delete: (id: string) =>
    request<{ ok: boolean }>(api(`accounts/${id}`), { method: "DELETE" })
};

export const todosApi = {
  getAll: () => request<Todo[]>(api("todos")),
  create: (todo: Todo) =>
    request<{ id: string }>(api("todos"), { method: "POST", body: JSON.stringify(todo) }),
  complete: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  approve: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/approve`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  reject: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/reject`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}`), { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    })
};

export const calendarsApi = {
  getAll: () => request<Calendar[]>(api("calendars")),
  create: (calendar: Calendar) =>
    request<{ id: string }>(api("calendars"), { method: "POST", body: JSON.stringify(calendar) }),
  addEvent: (calendarId: string, event: Calendar["events"][number]) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/events`), {
      method: "POST",
      body: JSON.stringify(event)
    }),
  share: (calendarId: string, memberId: string, access: string) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/share`), {
      method: "POST",
      body: JSON.stringify({ memberId, access })
    }),
  unshare: (calendarId: string, memberId: string) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/share/${memberId}`), {
      method: "DELETE"
    }),
  importEvents: (calendarId: string, source: object, events: object[]) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/import`), {
      method: "POST",
      body: JSON.stringify({ source, events })
    }),
  fetchIcs: (calendarId: string, url: string) =>
    request<{ icsText: string }>(api(`calendars/${calendarId}/fetch-ics`), {
      method: "POST",
      body: JSON.stringify({ url })
    }),
  updateEvent: (calendarId: string, eventId: string, updates: Partial<Calendar["events"][number]>) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/events/${eventId}`), {
      method: "PATCH",
      body: JSON.stringify(updates)
    }),
  deleteEvent: (calendarId: string, eventId: string) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/events/${eventId}`), {
      method: "DELETE"
    }),
  rsvpEvent: (calendarId: string, eventId: string, memberId: string, status: string) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/events/${eventId}/rsvp`), {
      method: "PATCH",
      body: JSON.stringify({ memberId, status })
    }),
  update: (id: string, patch: { color?: string; name?: string; ownerId?: string }) =>
    request<{ ok: boolean }>(api(`calendars/${id}`), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`calendars/${id}`), { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`calendars/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  createSubscription: (calendarId: string, sub: { url: string; includeWords: string[]; excludeWords: string[]; dateFrom: string | null; dateTo: string | null }) =>
    request<import("@shared/types").IcsSubscription>(api(`calendars/${calendarId}/subscriptions`), {
      method: "POST",
      body: JSON.stringify(sub)
    }),
  updateSubscription: (calendarId: string, subId: string, patch: { includeWords?: string[]; excludeWords?: string[]; dateFrom?: string | null; dateTo?: string | null }) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/subscriptions/${subId}`), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  deleteSubscription: (calendarId: string, subId: string) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/subscriptions/${subId}`), { method: "DELETE" }),
  syncSubscription: (calendarId: string, subId: string) =>
    request<{ ok: boolean }>(api(`calendars/${calendarId}/subscriptions/${subId}/sync`), {
      method: "POST",
      body: JSON.stringify({})
    })
};

export const shoppingApi = {
  getAll: () => request<ShoppingList[]>(api("shopping")),
  create: (list: ShoppingList) =>
    request<{ id: string }>(api("shopping"), { method: "POST", body: JSON.stringify(list) }),
  addItem: (listId: string, item: ShoppingList["items"][number]) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/items`), {
      method: "POST",
      body: JSON.stringify(item)
    }),
  toggleItem: (listId: string, itemId: string) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/items/${itemId}/toggle`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  share: (listId: string, memberId: string, access: string) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/share`), {
      method: "POST",
      body: JSON.stringify({ memberId, access })
    }),
  unshare: (listId: string, memberId: string) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/share/${memberId}`), { method: "DELETE" }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`shopping/${id}`), { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`shopping/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    })
};

export const rewardsApi = {
  getAll: () => request<Reward[]>(api("rewards")),
  create: (reward: Reward) =>
    request<{ id: string }>(api("rewards"), { method: "POST", body: JSON.stringify(reward) }),
  approve: (id: string, starsNeeded: number) =>
    request<{ ok: boolean }>(api(`rewards/${id}/approve`), {
      method: "PATCH",
      body: JSON.stringify({ starsNeeded })
    }),
  reject: (id: string) =>
    request<{ ok: boolean }>(api(`rewards/${id}/reject`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  redeem: (id: string) =>
    request<{ ok: boolean }>(api(`rewards/${id}/redeem`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`rewards/${id}`), { method: "DELETE" })
};
