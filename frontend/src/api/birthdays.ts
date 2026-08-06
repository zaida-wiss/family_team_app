import type { Birthday } from "@shared/types";
import { api, request } from "./client";

type BirthdayBody = {
  name: string;
  month: number;
  day: number;
  year: number | null;
};

// Familjeanslutningar (ADR-0030, 2026-08-06) — anslutna familjers
// födelsedagslista, läsning oavsett access-nivå (kontobrett, inte
// medlems-scopat, samma mönster som ConnectionRecipes/ConnectionShoppingLists).
export type ConnectionBirthdays = {
  accountId: string;
  accountName: string;
  birthdays: Birthday[];
};

export const birthdaysApi = {
  getAll: () => request<Birthday[]>(api("birthdays")),
  getConnectionBirthdays: () => request<ConnectionBirthdays[]>(api("birthdays/connections")),
  create: (body: BirthdayBody) =>
    request<Birthday>(api("birthdays"), { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: BirthdayBody) =>
    request<{ ok: boolean }>(api(`birthdays/${id}`), { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`birthdays/${id}`), { method: "DELETE" })
};
