import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Zaida (2026-08-11, Story 2 av Familjekonto-diskussionen, se
// docs/.../2026-08-11-installningar-familjekonto-omorganisation.md): rollen
// visades tidigare bara som skrivskyddad text i redigera-medlem-modalen —
// för att ändra roll fick man gå till en helt annan flik (Roller &
// behörigheter). Nu går det direkt i modalen, samma `onAssignRole` som
// RoleEditor.tsx redan använde.

const ACCOUNT = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null };
const ROLE_PARENT = {
  id: "role-parent", name: "Förälder", isChildRole: false,
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
const ROLE_HELPER = {
  ...ROLE_PARENT, id: "role-helper", name: "Hjälpreda",
  permissions: { ...ROLE_PARENT.permissions, canManageMembers: false, canManageRoles: false },
};
const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-parent", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const LARS = {
  id: "mem-2", accountId: "acc-1", userId: "user-2",
  name: "Lars", roleId: "role-parent", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "fake-access-token", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, LARS] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE_PARENT, ROLE_HELPER] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
}

test("Redigera medlem: byta roll direkt i modalen uppdaterar medlemsraden, utan att gå via Roller & behörigheter", async ({ page }) => {
  await mockCommon(page);
  let patchedRoleId: string | null = null;
  await page.route("**/api/members/mem-2", (route) => {
    const body = route.request().postDataJSON() as { roleId?: string } | null;
    if (body?.roleId) patchedRoleId = body.roleId;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Familj", exact: true }).click();
  await page.getByRole("button", { name: "Familjemedlemmar" }).click();

  const larsRow = page.locator(".settings-member-row").filter({ hasText: "Lars" });
  await expect(larsRow.getByText("Förälder")).toBeVisible();

  await larsRow.getByRole("button", { name: "Redigera Lars" }).click();
  const roleSelect = page.getByRole("dialog").getByLabel("Roll");
  await expect(roleSelect).toHaveValue("role-parent");
  await roleSelect.selectOption("role-helper");

  await page.getByRole("button", { name: "Stäng" }).click();

  await expect(larsRow.getByText("Hjälpreda")).toBeVisible();
  expect(patchedRoleId).toBe("role-helper");
});
