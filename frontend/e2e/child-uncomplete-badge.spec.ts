import { test, expect, type Page } from "@playwright/test";

// Ångra klarmarkering (2026-08-10, Zaidas önskemål: barnet ska kunna ångra
// ett håll-in-tryck som gjordes av misstag — samma håll-in-gest, men på den
// lilla snurrande "väntar på godkännande"-badgen (ChildPendingBadges.tsx),
// dragen uppåt mot uppdragskortens plats. Kortet ska bara komma tillbaka om
// det fortfarande finns tid att utföra uppgiften på (visibleFrom/expiresAt).

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
const LOGIN_RESPONSE = { accessToken: "fake-access-token", user: USER, memberships: [{ member: CHILD, account: ACCOUNT }] };

function doneTodo(overrides: Record<string, unknown>) {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  return {
    id: "todo-done-1",
    accountId: "acc-1",
    title: "Duka bordet",
    createdBy: "mem-parent",
    assignedTo: "mem-child",
    isShared: false,
    status: "done",
    starValue: 2,
    visual: { type: "lucide-icon", value: "🍽️" },
    recurrence: { type: "none" },
    recurringSourceId: null,
    occurrenceDate: null,
    visibleFrom: start.toISOString(),
    expiresAt: end.toISOString(),
    completedAt: now.toISOString(),
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

async function mockChildSession(page: Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
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
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
}

async function holdAndDragBadgeUp(page: Page, ms: number) {
  const badge = page.getByRole("button", { name: /väntar på godkännande/ });
  await expect(badge).toBeVisible({ timeout: 15000 });
  const box = await badge.boundingBox();
  if (!box) throw new Error("Badgen hittades inte");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Dra uppåt förbi tröskelvärdet (20px) — se useHoldDragConfirm.ts.
  await page.mouse.move(x, y - 40, { steps: 6 });
  await page.waitForTimeout(ms);
  return badge;
}

test("håll intryckt + dra uppåt i 2s ångrar klarmarkeringen, uppdragskortet kommer tillbaka", async ({ page }) => {
  let uncompleteCalled = false;
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [doneTodo({})] }));
  await page.route("**/api/todos/todo-done-1/uncomplete", (route) => {
    uncompleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /väntar på godkännande/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /Duka bordet/ })).toHaveCount(0);

  await holdAndDragBadgeUp(page, 2200);
  await page.mouse.up();

  expect(uncompleteCalled).toBe(true);
  await expect(page.getByRole("button", { name: /väntar på godkännande/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Duka bordet/ })).toBeVisible();
});

test("släpper man innan 2s har gått ångras ingenting", async ({ page }) => {
  let uncompleteCalled = false;
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [doneTodo({})] }));
  await page.route("**/api/todos/todo-done-1/uncomplete", (route) => {
    uncompleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await holdAndDragBadgeUp(page, 800);
  await page.mouse.up();
  await page.waitForTimeout(1500);

  expect(uncompleteCalled).toBe(false);
  await expect(page.getByRole("button", { name: /väntar på godkännande/ })).toBeVisible();
});

test("ett rakt håll utan att dra uppåt bekräftar INTE ångra, trots 2s", async ({ page }) => {
  let uncompleteCalled = false;
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [doneTodo({})] }));
  await page.route("**/api/todos/todo-done-1/uncomplete", (route) => {
    uncompleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  const badge = page.getByRole("button", { name: /väntar på godkännande/ });
  await expect(badge).toBeVisible({ timeout: 15000 });
  const box = await badge.boundingBox();
  if (!box) throw new Error("Badgen hittades inte");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2200);
  await page.mouse.up();

  expect(uncompleteCalled).toBe(false);
  await expect(badge).toBeVisible();
});

test("ångrar man en uppgift vars tidsfönster redan gått ut kommer kortet inte tillbaka", async ({ page }) => {
  let uncompleteCalled = false;
  await mockChildSession(page);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const start = new Date(yesterday); start.setHours(0, 0, 0, 0);
  const end = new Date(yesterday); end.setHours(23, 59, 59, 999);
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: [doneTodo({ visibleFrom: start.toISOString(), expiresAt: end.toISOString() })] })
  );
  await page.route("**/api/todos/todo-done-1/uncomplete", (route) => {
    uncompleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await holdAndDragBadgeUp(page, 2200);
  await page.mouse.up();

  expect(uncompleteCalled).toBe(true);
  await expect(page.getByRole("button", { name: /väntar på godkännande/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Duka bordet/ })).toHaveCount(0);
});
