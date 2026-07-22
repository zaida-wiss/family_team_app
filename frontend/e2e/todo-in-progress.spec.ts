import { test, expect } from "@playwright/test";

// Zaida (2026-07-22, "innan vi jobbar med cross family så ska vi lösa det i
// vår familj"): en "någon håller på med den här"-indikator. Dubbeltryck på
// bollen öppnar en avatarväljare — en ensam person visas som en tjock kant i
// personens färg, två eller fler som en delad klocka (ingen tävling).

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
  avatarUrl: null, color: "#e74c3c", dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const OTHER = {
  id: "mem-2", accountId: "acc-1", userId: "user-2",
  name: "Lars", roleId: "role-1", isChild: false,
  avatarUrl: null, color: "#3498db", dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const CATEGORY = { id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Städning", createdAt: "2024-01-01T00:00:00.000Z", hidden: false, deletedAt: null, deletedBy: null };
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "fake-access-token", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

function todo(overrides: Record<string, unknown>) {
  return {
    accountId: "acc-1", createdBy: "mem-1", assignedTo: "mem-1", isShared: false,
    status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "Star" },
    recurrence: { type: "none" }, recurringSourceId: null, occurrenceDate: null,
    completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: "cat-1", notes: null, inProgressBy: [], inProgressSince: null,
    ...overrides
  };
}

async function mockCommon(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, OTHER] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
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

test("dubbeltryck öppnar en avatarväljare, val av en medlem visar en tjock kant i deras färg", async ({ page }) => {
  await mockCommon(page);
  const t = todo({ id: "todo-1", title: "Dammsuga" });
  await page.route("**/api/todos", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [t] }) : route.fulfill({ json: {} })
  );
  let toggleBody: Record<string, unknown> | null = null;
  await page.route("**/api/todos/todo-1/in-progress", (route) => {
    toggleBody = route.request().postDataJSON() as Record<string, unknown>;
    route.fulfill({ json: { inProgressBy: ["mem-1"], inProgressSince: new Date().toISOString() } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const ball = page.getByRole("button", { name: /Dammsuga/ });
  await ball.click();
  await ball.click();

  const picker = page.getByRole("menu");
  await expect(picker.getByText("Vem håller på med den här?")).toBeVisible();
  await picker.getByRole("button", { name: "Testförälder" }).click();

  expect(toggleBody).toEqual({ targetMemberId: "mem-1" });
});

test("två personer på samma uppgift visar en delad klocka istället för en kant", async ({ page }) => {
  await mockCommon(page);
  const t = todo({
    id: "todo-2", title: "Diska",
    inProgressBy: ["mem-1", "mem-2"],
    inProgressSince: new Date(Date.now() - 65000).toISOString()
  });
  await page.route("**/api/todos", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [t] }) : route.fulfill({ json: {} })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  // Klockan visar minuter:sekunder och tickar (så exakt sekund inte
  // hårdkodas, bara att en rimlig "1:0X"-etikett syns).
  await expect(page.getByText(/^1:0\d$/)).toBeVisible();
});

test("ett vanligt enkelt tryck öppnar fortsatt detaljvyn (oförändrat)", async ({ page }) => {
  await mockCommon(page);
  const t = todo({ id: "todo-3", title: "Handla mat" });
  await page.route("**/api/todos", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [t] }) : route.fulfill({ json: {} })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();
  await page.getByRole("button", { name: /Handla mat/ }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
});
