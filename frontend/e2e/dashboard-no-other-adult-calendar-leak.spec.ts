import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Zaida (2026-08-11): "På dashboard skall inte andra medlemmars kalendrar
// synas, om inte just den händelsen delas med dig att du skall närvara i
// aktiviteten." Bugg hittad under verifiering: ChildTimeline.tsx:s
// canSeeAllCalendar-koll gällde tidigare den VISADE personens roll, inte
// den som faktiskt TITTAR — en förälder A som öppnade en ANNAN förälders
// (Lars) dashboard fick se SIN EGEN kalender blandad in där, bara för att
// Lars roll råkade ha canSeeAllCalendar. Ett första fixförsök (bypass bara
// för barns dashboard) återinförde en annan, redan verifierad regression
// (calendar-dashboard-visibility.spec.ts) — löst genom att ta bort
// bypassen helt: en dashboard visar bara ägarens egna kalendrar +
// dashboardVisibleTo-grantade + attendee-taggade händelser, oavsett roll.

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
const LARS = {
  id: "mem-2", accountId: "acc-1", userId: "user-2",
  name: "Lars", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "fake-access-token", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

const today = new Date();
const eventDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

function allDayEvent(overrides: Record<string, unknown>) {
  return {
    startsAt: `${eventDateStr}T00:00:00.000Z`, endsAt: `${eventDateStr}T23:59:59.000Z`,
    isAllDay: true, color: null, uid: null, subscriptionId: null, location: null, notes: null,
    recurrence: { type: "none" }, attendees: [], symbol: null,
    createdBy: "mem-1", deletedAt: null, deletedBy: null,
    ...overrides
  };
}

// Servern skulle inte skicka Lars kalender alls till förälderns webbläsare
// (den är inte delad, se calendarSharingDefaultPrivate.integration.test.ts)
// — den enda kalendern i mocken som EGENTLIGEN kan läcka in på Lars
// dashboard är förälderns EGEN, redan hämtade kalender.
const PARENT_CALENDAR = {
  id: "cal-parent", name: "Förälderns kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], dashboardVisibleTo: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [allDayEvent({ id: "ev-parent", calendarId: "cal-parent", title: "Förälderns egen händelse" })],
  importedSources: [], subscriptions: [],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, LARS] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [PARENT_CALENDAR] }));
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));
}

test("Lars dashboard (visad av föräldern) visar INTE förälderns egen kalenderhändelse, trots att Lars roll har canSeeAllCalendar", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Lars" }).click();

  await expect(page.getByText("Förälderns egen händelse")).toHaveCount(0);
});
