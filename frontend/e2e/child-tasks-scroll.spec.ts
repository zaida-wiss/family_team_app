import { test, expect } from "@playwright/test";

// Zaida (2026-07-23): "det måste gå att scrolla i barnvyn / medlemsvyn med
// uppdragskorten" — .child-tasks-grid (ChildTasksSection.tsx, delad av
// barnens egen dashboard OCH PersonalDashboard.tsx) hade overflow:hidden,
// så fler uppdrag än vad som fick plats klipptes bort helt utan att gå att
// nå. Fixat med overflow-y:auto på precis den listan (den omgivande
// .child-dashboard är medvetet fast/utan scroll, oförändrat).

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
  avatarUrl: null, color: null, dashboardTheme: "clear",
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "tok", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

function todo(overrides: Record<string, unknown>) {
  return {
    accountId: "acc-1", createdBy: "mem-1", assignedTo: "mem-1", isShared: false,
    status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "Star" },
    recurrence: { type: "none" }, recurringSourceId: null, occurrenceDate: null,
    completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null,
    ...overrides
  };
}

const MANY_TODOS = Array.from({ length: 24 }, (_, i) => todo({ id: `todo-${i}`, title: `Uppgift ${i + 1}` }));

test("uppdragskorten går att scrolla när fler uppgifter finns än vad som får plats", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: MANY_TODOS }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased/, (route) => route.fulfill({ json: [] }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/todo-templates/**", (route) => route.fulfill({ json: [] }));

  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Medlemmar" }).click();
  await page.getByRole("button", { name: /Testförälder/ }).click();

  await expect(page.getByText("Uppgift 1", { exact: true })).toBeVisible();

  const grid = page.locator(".child-tasks-grid");
  const { scrollHeight, clientHeight } = await grid.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  await expect(page.getByText("Uppgift 24")).not.toBeInViewport();
  await grid.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByText("Uppgift 24")).toBeInViewport();
});
