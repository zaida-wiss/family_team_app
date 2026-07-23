import { test, expect } from "@playwright/test";

// Zaida (2026-07-23): "just nu så går det inte att välja att tilldela...
// kalendrar till familjen, bara på familjemedlemmar" — ny "Hela familjen"-
// snabbknapp i händelsemodalens deltagarlista (CalendarEventModal.tsx) kryssar
// i/ur samtliga övriga medlemmar på en gång, istället för en i taget.

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
const LARS = {
  id: "mem-2", accountId: "acc-1", userId: "user-2",
  name: "Lars", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const HANNA = {
  id: "mem-3", accountId: "acc-1", userId: null,
  name: "Hanna", roleId: "role-1", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: PARENT, account: ACCOUNT }],
};

const PARENT_CALENDAR = {
  id: "cal-parent", name: "Testförälderns kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [], importedSources: [], subscriptions: [],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, LARS, HANNA] }));
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
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [PARENT_CALENDAR] }));
}

test("Ny händelse-modalen: 'Hela familjen' kryssar i/ur alla deltagare på en gång", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Kalender" }).click();
  await page.getByRole("button", { name: "Ny händelse" }).click();

  // Deltagar-kryssrutorna är visuellt dolda (style display:none, egen
  // stylad label-rad) — söks via CSS-selektorn, inte getByRole, eftersom en
  // display:none-checkbox inte finns i tillgänglighetsträdet.
  const allRow = page.locator(".cal-attendee-item--all");
  const larsRow = page.locator(".cal-attendee-item", { hasText: "Lars" });
  const hannaRow = page.locator(".cal-attendee-item", { hasText: "Hanna" });
  const allBox = allRow.locator("input[type=checkbox]");
  const larsBox = larsRow.locator("input[type=checkbox]");
  const hannaBox = hannaRow.locator("input[type=checkbox]");

  await expect(allBox).not.toBeChecked();
  await expect(larsBox).not.toBeChecked();
  await expect(hannaBox).not.toBeChecked();

  // Klick på Hela familjen kryssar i alla individuella medlemmar.
  await allRow.click();
  await expect(allBox).toBeChecked();
  await expect(larsBox).toBeChecked();
  await expect(hannaBox).toBeChecked();

  // Klick igen kryssar ur alla.
  await allRow.click();
  await expect(allBox).not.toBeChecked();
  await expect(larsBox).not.toBeChecked();
  await expect(hannaBox).not.toBeChecked();

  // Kryssar i en enskild medlem manuellt — Hela familjen-rutan ska INTE
  // visas som ikryssad förrän ALLA är valda.
  await larsRow.click();
  await expect(larsBox).toBeChecked();
  await expect(allBox).not.toBeChecked();

  await hannaRow.click();
  await expect(hannaBox).toBeChecked();
  await expect(allBox).toBeChecked();
});
