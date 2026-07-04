import { test, expect, type Page } from "@playwright/test";

// Sprint 4 S3: barnets Rekord-vy — start/stopp-tryck (inte håll-in, se S9-spiken),
// live tidräknare medan igång, personbästa uppdateras efter stopp.

const ACCOUNT = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-parent", deletedAt: null };

const CHILD_ROLE = {
  id: "role-child",
  name: "Barn",
  isChildRole: true,
  permissions: {
    canManageMembers: false, canManageRoles: false,
    canSeeAllTodos: false, canSeeOwnTodos: true, canCreateTodos: false,
    canScheduleRecurringTodos: false, canCompleteAssignedTodos: true,
    canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false,
    canSeeAllCalendar: false, canSeeOwnCalendar: true, canCreateCalendar: false,
    canEditCalendar: false, canImportCalendar: false, canExportCalendar: false,
    canSeeShoppingLists: false, canCreateShoppingLists: false, canEditShoppingLists: false,
    canViewTrash: false, canRestoreFromTrash: false,
    canCreateChildAccounts: false, canManageChildTodos: false,
  },
};

const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};

const USER = { id: "user-child", email: "nova@exempel.se", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };

const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: CHILD, account: ACCOUNT }],
};

const TIMED_TASK = {
  id: "tt-1",
  accountId: "acc-1",
  title: "Springa ett varv",
  symbol: "🏃",
  assignedTo: "mem-child",
  createdBy: "mem-parent",
  deletedAt: null,
  deletedBy: null,
  bestDurationMs: null,
  bestAchievedAt: null,
  attemptCount: 0,
};

async function mockChildSession(page: Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
}

test("Barnets Rekord-vy: start/stopp spelar in ett försök", async ({ page }) => {
  let recordedDurationMs: number | null = null;
  await mockChildSession(page);
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [TIMED_TASK] }));
  await page.route("**/api/timed-tasks/tt-1/attempts", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { durationMs: number };
    recordedDurationMs = body.durationMs;
    return route.fulfill({
      status: 201,
      json: { id: "ta-1", durationMs: body.durationMs, achievedAt: new Date().toISOString(), isNewRecord: true },
    });
  });

  await page.goto("/");
  await expect(page.getByText("Springa ett varv")).toBeVisible();
  await expect(page.getByText("Inget rekord än")).toBeVisible();

  await page.getByRole("button", { name: "Starta tidtagning för Springa ett varv" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Stoppa tidtagning för Springa ett varv" }).click();

  await expect.poll(() => recordedDurationMs).not.toBeNull();
  expect(recordedDurationMs).toBeGreaterThan(500);
  expect(recordedDurationMs).toBeLessThan(5000);
});
