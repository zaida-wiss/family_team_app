import type { Calendar, IcsSubscription } from "@shared/types";
import { api, request } from "./client";

export const calendarsApi = {
  getAll: (from?: string, until?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (until) params.set("until", until);
    const qs = params.size ? `?${params}` : "";
    return request<Calendar[]>(api(`calendars${qs}`));
  },
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
  update: (id: string, patch: { color?: string; name?: string; ownerId?: string; keepAllHistory?: boolean }) =>
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
    request<IcsSubscription>(api(`calendars/${calendarId}/subscriptions`), {
      method: "POST",
      body: JSON.stringify(sub)
    }),
  updateSubscription: (calendarId: string, subId: string, patch: { includeWords?: string[]; excludeWords?: string[]; dateFrom?: string | null; dateTo?: string | null; displaySymbol?: string | null }) =>
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
