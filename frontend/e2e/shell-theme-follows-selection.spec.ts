import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Regressionstest för en bugg jag införde själv (2026-07-23) i samma
// ändring som flyttade medlemsvalet från Hem till Medlemmar-panelen:
// Shell.tsx:s app-shell-tema (bakgrundsgradient m.m.) följde tidigare
// activePanel==="home" för att spegla en vald medlems tema — glömdes bort
// när valet flyttades till activePanel==="members", vilket hade gjort att
// app-skalet ALDRIG längre bytte tema till ett valt barns, även när man
// faktiskt tittade på barnets dashboard.

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
  avatarUrl: null, color: null, dashboardTheme: "clear",
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: "ocean",
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "tok", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

test("app-skalets tema följer den valda medlemmen på Medlemmar-panelen", async ({ page }) => {
  // 2026-08-10: mockDataAPIs() (helpers.ts) registreras FÖRST — se
  // todo-timer.spec.ts:s identiska kommentar (samma bugklass).
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE, CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));

  await page.goto("/");
  await expect(page.locator("main.app-shell")).toHaveClass(/theme-clear/);

  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Nova" }).click();

  await expect(page.locator("main.app-shell")).toHaveClass(/theme-ocean/);

  await page.getByRole("button", { name: "Hem" }).click();
  await expect(page.locator("main.app-shell")).toHaveClass(/theme-clear/);
});
