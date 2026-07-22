import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Zaida (2026-07-23): "soft deletade medlemmar skall inte dyka upp på listor
// över val av familjemedlemmar" — flera val-listor (RoleEditor:s
// "Tilldela roll", ShoppingListsPanel:s/ShoppingView:s/CalendarShareSection:s
// dela-med-dropdowns, ParentTodoThreadView:s "Vem håller på med den här?")
// visade tidigare hela den ofiltrerade medlemslistan, inklusive redan
// raderade medlemmar. Testar två representativa fall (Roller, Inköpslistor)
// — övriga (ShoppingView, CalendarShareSection, ParentTodoThreadView) fick
// samma fix men täcks inte var för sig här.

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
const ACTIVE_OTHER = {
  id: "mem-2", accountId: "acc-1", userId: null,
  name: "Aktiv förälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const DELETED_OTHER = {
  id: "mem-3", accountId: "acc-1", userId: null,
  name: "Raderad förälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: "2026-07-01T00:00:00.000Z", deletedBy: "mem-1",
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "tok", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

async function setUpCommonRoutes(page: Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, ACTIVE_OTHER, DELETED_OTHER] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [{
          id: "list-1", accountId: "acc-1", ownerId: "mem-1", name: "Veckohandling",
          color: "#2f7d6d", icon: null, sharedWith: [], deletedAt: null, deletedBy: null, items: []
        }]
      });
    }
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/reward-shop**", (route) => route.fulfill({ json: { items: [], requireApprovalForCategories: false } }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/todo-templates/**", (route) => route.fulfill({ json: [] }));
}

test("RoleEditor: en raderad medlem visas inte i Tilldela roll-listan", async ({ page }) => {
  await setUpCommonRoutes(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Konto & familj" }).click();
  await page.getByRole("button", { name: "Roller & behörigheter" }).click();

  await expect(page.getByText("Aktiv förälder")).toBeVisible();
  await expect(page.getByText("Raderad förälder")).toHaveCount(0);
});

test("ShoppingListsPanel: en raderad medlem erbjuds inte i dela-med-listan", async ({ page }) => {
  await setUpCommonRoutes(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Inköpslistor" }).click();

  const shareSelect = page.getByRole("combobox", { name: "Välj medlem att dela med" });
  await expect(shareSelect).toBeVisible();
  const optionTexts = await shareSelect.locator("option").allTextContents();
  expect(optionTexts).toContain("Aktiv förälder");
  expect(optionTexts).not.toContain("Raderad förälder");
});
