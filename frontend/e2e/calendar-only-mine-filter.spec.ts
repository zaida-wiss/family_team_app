import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-10, Zaidas backloggpost (2026-08-01): "Kalender-panelens 'egna vs
// delade kalendrar i samma lista'-begränsning" — panelens redan existerande
// filter (tratt-ikonen) blandade egna och delade/cross-account-kalendrar i
// en enda kryssrutelista utan genväg. Löst genom en "Bara mina
// kalendrar"-snabbknapp överst i samma dropdown (inte en helt ny vy) — den
// avmarkerar alla kalendrar jag inte äger med ETT klick, "Visa alla" gör
// motsatsen. Ren UI-filtrering (befintlig hiddenCalendarIds-mekanism),
// ingen ny backend-endpoint.

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

const now = new Date();
const eventStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0).toISOString();
const eventEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0).toISOString();

function makeEvent(overrides: Record<string, unknown>) {
  return {
    startsAt: eventStart, endsAt: eventEnd, isAllDay: false, color: null, uid: null,
    subscriptionId: null, location: null, notes: null, recurrence: { type: "none" },
    attendees: [], symbol: null, createdBy: "mem-1", deletedAt: null, deletedBy: null,
    ...overrides
  };
}

const OWN_CALENDAR = {
  id: "cal-own", name: "Min kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  importedSources: [], subscriptions: [],
  events: [makeEvent({ id: "ev-own", calendarId: "cal-own", title: "Mitt eget möte" })],
};

const SHARED_CALENDAR = {
  id: "cal-shared", name: "Lars kalender", ownerId: "mem-2", color: "#3498db",
  sharedWith: [{ memberId: "mem-1", access: "view" }],
  deletedAt: null, deletedBy: null, keepAllHistory: false,
  importedSources: [], subscriptions: [], readOnly: true,
  events: [makeEvent({ id: "ev-shared", calendarId: "cal-shared", title: "Lars tandläkarbesök", createdBy: "mem-2" })],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [OWN_CALENDAR] }));
  // Registrerad EFTER den breda /api/calendars**-mocken ovan (Playwright:
  // senast registrerad matchning vinner) — samma ordningskrav som redan
  // dokumenterat i calendar-event-symbol.spec.ts.
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [SHARED_CALENDAR] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));
}

test("Bara mina kalendrar-snabbknappen döljer delade kalendrar, Visa alla återställer", async ({ page }) => {
  await mockCommon(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();

  await expect(page.getByText("Mitt eget möte")).toBeVisible();
  await expect(page.getByText("Lars tandläkarbesök")).toBeVisible();

  await page.getByRole("button", { name: "Filtrera kalendrar" }).click();
  await page.getByRole("button", { name: "Bara mina kalendrar" }).click();

  await expect(page.getByText("Mitt eget möte")).toBeVisible();
  await expect(page.getByText("Lars tandläkarbesök")).not.toBeVisible();

  await page.getByRole("button", { name: "Visa alla" }).click();

  await expect(page.getByText("Mitt eget möte")).toBeVisible();
  await expect(page.getByText("Lars tandläkarbesök")).toBeVisible();
});

test("Bara mina kalendrar-knappen syns inte om jag inte har några delade kalendrar", async ({ page }) => {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [OWN_CALENDAR] }));
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();

  await page.getByRole("button", { name: "Filtrera kalendrar" }).click();
  await expect(page.getByRole("button", { name: "Bara mina kalendrar" })).toHaveCount(0);
});
