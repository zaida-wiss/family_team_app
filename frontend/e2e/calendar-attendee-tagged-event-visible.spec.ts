import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Zaida (2026-08-11): "Som standard skall inte min kalender dyka upp i de
// andra familjemedlemmarnas kalender... såvida jag inte skrivit att den
// händelsen är tillsammans med dom." Behörighetsfiltreringen flyttades
// server-side (calendarsService.ts:s filterCalendarsForCaller) — frontend
// (useCalendarView.ts) förenklades till att LITA på vad servern skickar,
// istället för att gissa om via ett eget (nu felaktigt) sharedWith-/
// canSeeAllCalendar-återfilter. Det här testet låser fast just DEN
// kontraktsgränsen: en kalender som inte ägs av/delas med mig, men där en
// enskild händelse taggat mig som deltagare (exakt formen servern nu
// returnerar för det fallet), ska fortfarande synas i kalenderpanelen —
// om frontend av misstag återinför ett client-side sharedWith-filter
// skulle den här händelsen felaktigt försvinna.

const ACCOUNT = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null };
const ROLE = {
  id: "role-1", name: "Förälder", isChildRole: false,
  permissions: {
    canManageMembers: true, canManageRoles: true,
    canSeeAllTodos: true, canSeeOwnTodos: true, canCreateTodos: true,
    canScheduleRecurringTodos: true, canCompleteAssignedTodos: true,
    canEditAnyTodos: true, canDeleteAnyTodos: true, canApproveTodos: true,
    canSeeAllCalendar: true, canSeeOwnCalendar: true, canCreateCalendar: true,
    canEditCalendar: true, canImportCalendar: true, canExportCalendar: true,
    canSeeShoppingLists: true, canCreateShoppingLists: true, canEditShoppingLists: true,
    canViewTrash: true, canRestoreFromTrash: true,
    canCreateChildAccounts: true, canManageChildTodos: true,
  },
};
const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "fake-access-token", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

const today = new Date();
const eventDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

function event(overrides: Record<string, unknown>) {
  return {
    startsAt: `${eventDateStr}T09:00:00.000Z`, endsAt: `${eventDateStr}T10:00:00.000Z`,
    isAllDay: false, color: null, uid: null, subscriptionId: null, location: null, notes: null,
    recurrence: { type: "none" }, attendees: [], symbol: null,
    createdBy: "mem-2", deletedAt: null, deletedBy: null,
    ...overrides
  };
}

const MY_CALENDAR = {
  id: "cal-mine", name: "Min kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], dashboardVisibleTo: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [event({ id: "ev-mine", calendarId: "cal-mine", title: "Mitt eget möte" })],
  importedSources: [], subscriptions: [],
};
// Servern skulle ALDRIG skicka Lars övriga privata händelser hit — bara
// den ENDA där jag taggats som deltagare (se backend-integrationstestet
// calendarSharingDefaultPrivate.integration.test.ts för själva filtreringen).
const LARS_CALENDAR_ATTENDEE_ONLY = {
  id: "cal-lars", name: "Lars kalender", ownerId: "mem-2", color: "#a855f7",
  sharedWith: [], dashboardVisibleTo: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [event({
    id: "ev-together", calendarId: "cal-lars", title: "Middag ihop",
    attendees: [{ memberId: "mem-1", status: "pending" }]
  })],
  importedSources: [], subscriptions: [],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [MY_CALENDAR, LARS_CALENDAR_ATTENDEE_ONLY] }));
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));
}

test("Kalenderpanelen visar en attendee-taggad händelse från en annars odelad kalender, precis som servern skickar den", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();

  await expect(page.getByText("Mitt eget möte").first()).toBeVisible();
  await expect(page.getByText("Middag ihop").first()).toBeVisible();
});
