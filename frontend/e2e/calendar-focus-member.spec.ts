import { test, expect } from "@playwright/test";

// Zaida (2026-07-23): "Klickar vi på hemmet eller kalendern så ska det inte
// längre vara barnvyn" — reverserar 2026-07-21/22-beteendet som den här
// filen tidigare testade (att Kalender-panelen visade en vald familjemedlems
// kalender som förval). Med den nya designen (Shell.tsx:s PanelRouter,
// useAppState.ts:s setActivePanel) rensas ett medlemsval alltid när man
// navigerar till NÅGON av Hem/Kalender/Todos/Inköp — att välja någon i
// Medlemmar-panelen påverkar bara den panelen. Kalender-panelen visar därför
// alltid den INLOGGADE förälderns egen kalender, oavsett vem som senast
// valdes i medlemsväljaren.

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
  await page.route("**/api/todo-templates/**", (route) => route.fulfill({ json: [] }));
}

test("Klickar igenom Hem → Medlemmar → välj en vuxen → Kalender: visar min VANLIGA kalendervy, inte filtrerad till den valda personen", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [PARENT_CALENDAR, LARS_CALENDAR] }));

  await page.goto("/");

  // Hem → Medlemmar → klicka på Lars — visas nu i Medlemmar-panelen själv,
  // navigerar inte längre bort.
  await page.getByRole("button", { name: "Medlemmar" }).click();
  await page.getByRole("button", { name: /Lars/ }).click();

  // Klicket på Kalender-ikonen rensar valet (useAppState.ts:s setActivePanel)
  // — visar min vanliga, ofiltrerade kalendervy igen. Rollen har
  // canSeeAllCalendar, så BÅDA kalendrarna syns (ingen filtrering på en
  // specifik person längre) — det är just avsaknaden av en Lars-ENDAST-
  // filtrering som visar att bugfixen fungerar, inte att Lars kalender
  // försvinner helt.
  await page.getByRole("button", { name: "Kalender" }).click();

  await expect(page.getByText("Förälderns möte")).toBeVisible();
  await expect(page.getByText("Lars tandläkarbesök")).toBeVisible();
});
