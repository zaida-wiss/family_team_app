import { test, expect } from "@playwright/test";

// Zaida (2026-07-22): "Som vuxen ser jag ingen barnvy när jag klickar på min
// profil på medlemsvyn. Jag vill kunna se mina uppgifter och kalendrar på
// samma sätt som barnen gör när jag trycker på min profilbild inne i
// familjemedlemmars vyn." Ny PersonalDashboard.tsx återanvänder ChildDashboards
// underkomponenter (timeline, veckoremsa, uppgiftskort med håll-in) utan
// stjärnor/belöningsbutik, som inte gäller en vuxens egna uppgifter. Gäller
// bara SJÄLV-val — väljer man en ANNAN vuxen ska den vanliga hemvyn visas
// oförändrat (regressionskoll i andra testet).

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
  avatarUrl: null, color: null, dashboardTheme: "sunset",
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const OTHER_ADULT = {
  id: "mem-2", accountId: "acc-1", userId: "user-2",
  name: "Lars", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const TODO = {
  id: "todo-1", accountId: "acc-1", title: "Handla mat", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "fake-access-token", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

async function mockCommon(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, OTHER_ADULT] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/reward-shop**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased/, (route) => route.fulfill({ json: [] }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
}

test("vuxen som klickar sin egen profil ser sina uppgifter+kalender, inte Familjens kalender", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Medlemmar" }).click();
  await page.getByRole("button", { name: /Testförälder/ }).click();

  await expect(page.getByText("Hej Testförälder!")).toBeVisible();
  await expect(page.getByText("Handla mat")).toBeVisible();
  await expect(page.getByText("Familjens kalender")).toHaveCount(0);
});

test("vuxen som klickar en ANNAN vuxens profil ser fortfarande den vanliga hemvyn, oförändrat", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Medlemmar" }).click();
  await page.getByRole("button", { name: /Lars/ }).click();

  await expect(page.getByText("Hej Testförälder!")).toHaveCount(0);
  await expect(page.getByText("Handla mat")).toHaveCount(0);
  await expect(page.getByText("Familjens kalender")).toBeVisible();
});
