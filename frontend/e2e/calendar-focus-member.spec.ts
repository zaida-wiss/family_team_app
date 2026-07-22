import { test, expect } from "@playwright/test";

// Zaida (2026-07-21, rättad 2026-07-22, uppföljd 2026-07-22): "om man först
// väljer familjemedlem och sedan går till kalendern så är det inte den
// personens kalender... Jag ska ENDAST se den valda familjemedlemmens
// kalender... Filtreringen skall motsvara kalendrar som tillhör den
// personen som den valt att dela med mig", följt av "även andra vuxna
// familjemedlemmars kalender skall visas på kalender". Grundorsaken var
// TVÅFALDIG:
// 1) Kalender-panelen använde bara currentMember, aldrig vald medlem
//    (fixat 668ee03, otillräckligt — bara "vilken kalender föreslås"-delen).
// 2) DEN FAKTISKA roten: useAppState.ts:s setActivePanel nollställde
//    selectedDashboardMemberId varje gång man navigerade till NÅGOT ANNAT
//    än Hem — inklusive Kalender — så valet försvann innan Kalender-panelen
//    ens hann rendera. Detta testet klickar igenom det RIKTIGA flödet
//    (Hem → Medlemmar → välj en VUXEN → Kalender) istället för att bara
//    ladda appen redan stående på Kalender-panelen (som det tidigare,
//    otillräckliga testet gjorde — det missade just denna nollställning).

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
  lastActivePanel: "home", lastSelectedDashboardMemberId: null,
};
// En ANDRA vuxen (inte barn) — Zaidas uppföljning specifikt om vuxna.
const OTHER_ADULT = {
  id: "mem-2", accountId: "acc-1", userId: "user-2",
  name: "Lars", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
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
const LARS_CALENDAR = {
  id: "cal-lars", name: "Lars kalender", ownerId: "mem-2", color: "#a855f7",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [calendarEvent({ id: "ev-lars", calendarId: "cal-lars", title: "Lars tandläkarbesök" })],
  importedSources: [], subscriptions: [],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, OTHER_ADULT] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
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

test("Klickar igenom Hem → Medlemmar → välj en vuxen → Kalender: visar bara den vuxnas kalender", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [PARENT_CALENDAR, LARS_CALENDAR] }));

  await page.goto("/");

  // Hem → Medlemmar → klicka på Lars (onSelectMember + navigerar tillbaka
  // till Hem, samma flöde som MembersView.tsx faktiskt gör).
  await page.getByRole("button", { name: "Medlemmar" }).click();
  await page.getByRole("button", { name: /Lars/ }).click();

  // Nu på Kalender — om selectedDashboardMemberId nollställdes av
  // navigeringen (den faktiska buggen) skulle förälderns egen kalender
  // synas istället för Lars.
  await page.getByRole("button", { name: "Kalender" }).click();

  await expect(page.getByText("Lars tandläkarbesök")).toBeVisible();
  await expect(page.getByText("Förälderns möte")).toHaveCount(0);
});
