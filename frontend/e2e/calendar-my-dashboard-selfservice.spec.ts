import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Zaida (2026-08-11, uppföljning av Familjekonto-diskussionen, se
// docs/.../2026-08-11-installningar-familjekonto-omorganisation.md):
// dashboardVisibleTo (2026-08-11-fixet tidigare samma dag) kunde bara sättas
// av en admin, och bara för barn. Vuxna ska själva, bland kalendrar NÅGON
// ANNAN redan delat med dem, kunna välja vilka som visas på deras EGEN
// dashboard — oberoende av att kalendern redan syns i familjekalendern.
// Nollställt som standard: ingen kryssruta förikryssad.

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

const PARENT_CALENDAR = {
  id: "cal-parent", name: "Min kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], dashboardVisibleTo: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [], importedSources: [], subscriptions: [], calDavConnections: [],
};
// Lars delar sin kalender med mig (familjekalendern) — men jag har INTE
// valt att ha den på min dashboard än.
const LARS_CALENDAR = {
  id: "cal-lars", name: "Lars kalender", ownerId: "mem-2", color: "#a855f7",
  sharedWith: [{ memberId: "mem-1", access: "view" }], dashboardVisibleTo: [],
  deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [], importedSources: [], subscriptions: [], calDavConnections: [],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, LARS] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [PARENT_CALENDAR, LARS_CALENDAR] }));
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));
}

test("Min dashboard: vuxen kan själv välja vilka delade kalendrar som visas på egen dashboard, nollställt som standard", async ({ page }) => {
  await mockCommon(page);
  let dashboardVisibilityCalled = false;
  await page.route("**/api/calendars/cal-lars/dashboard-visibility", (route) => {
    dashboardVisibilityCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.locator(".settings-category-grid").getByRole("button", { name: "Kalender" }).click();

  const section = page.getByRole("region", { name: "Min dashboard" });
  await expect(section).toBeVisible();
  await expect(section.getByText("Lars kalender")).toBeVisible();

  const checkbox = section.getByRole("checkbox");
  await expect(checkbox).not.toBeChecked();

  await checkbox.check();
  await expect(checkbox).toBeChecked();
  expect(dashboardVisibilityCalled).toBe(true);
});

test("Min dashboard: tomt läge när ingen delat en kalender med mig", async ({ page }) => {
  await mockCommon(page);
  // Ingen sharedWith mot mem-1 — Lars kalender är privat.
  await page.route("**/api/calendars**", (route) =>
    route.fulfill({ json: [PARENT_CALENDAR, { ...LARS_CALENDAR, sharedWith: [] }] })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.locator(".settings-category-grid").getByRole("button", { name: "Kalender" }).click();

  const section = page.getByRole("region", { name: "Min dashboard" });
  await expect(section).toBeVisible();
  await expect(section.getByText("Ingen har delat en kalender med dig än.")).toBeVisible();
});
