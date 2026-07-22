import { test, expect } from "@playwright/test";

// Zaida (2026-07-21, rättad 2026-07-22): "om man först väljer familjemedlem
// och sedan går till kalendern så är det inte den personens kalender...
// Jag ska ENDAST se den valda familjemedlemmens kalender... Filtreringen
// skall motsvara kalendrar som tillhör den personen som den valt att dela
// med mig." Kalender-panelen (till skillnad från Hem-vyn, som medvetet är
// oförändrad) ska filtrera ner till BARA den valda medlemmens egna
// kalender(ar) när en medlem är vald i medlemsväljaren.

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
const CHILD_ROLE = { ...ROLE, id: "role-child", name: "Barn", isChildRole: true };

const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
  // Simulerar att föräldern redan står på barnets Kalender-panel (samma
  // mönster som member-dashboard-refresh.spec.ts).
  lastActivePanel: "calendar", lastSelectedDashboardMemberId: "mem-child",
};
const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: PARENT, account: ACCOUNT }],
};

function calendarEvent(overrides: Record<string, unknown>) {
  return {
    id: overrides.id, calendarId: overrides.calendarId, title: overrides.title,
    startsAt: "2026-07-15T09:00:00.000Z", endsAt: "2026-07-15T10:00:00.000Z",
    isAllDay: false, color: null, uid: null, subscriptionId: null,
    location: null, notes: null, recurrence: { type: "none" }, attendees: [],
    symbol: null, createdBy: "mem-1", deletedAt: null, deletedBy: null,
    ...overrides
  };
}

const PARENT_CALENDAR = {
  id: "cal-parent", name: "Testförälderns kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [calendarEvent({ id: "ev-parent", calendarId: "cal-parent", title: "Förälderns möte" })],
  importedSources: [], subscriptions: [],
};
const CHILD_CALENDAR = {
  id: "cal-child", name: "Novas kalender", ownerId: "mem-child", color: "#a855f7",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [calendarEvent({ id: "ev-child", calendarId: "cal-child", title: "Novas fotbollsträning" })],
  importedSources: [], subscriptions: [],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE, CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/reward-shop**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
}

test("Kalender-panelen visar bara den valda familjemedlemmens egna kalender, inte hela familjens", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [PARENT_CALENDAR, CHILD_CALENDAR] }));

  await page.goto("/");

  await expect(page.getByText("Novas fotbollsträning")).toBeVisible();
  await expect(page.getByText("Förälderns möte")).toHaveCount(0);
});
