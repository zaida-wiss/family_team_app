import { test, expect } from "@playwright/test";

// Zaida (2026-07-22): "vi behöver kunna radera inköpslistor och rader i
// inköpslistan, samt välja att dölja gjorda rader, alternativt placera
// överstrukna rader längst ner", följt av "töm listan kan vara ett val".
// Listradering fanns redan (Inställningar → Inköpslistor). Detta testar de
// tre NYA delarna: radera enskild rad, visningsläge för bockade varor
// (visa/bockade sist/dölj), och Töm listan (rensar bara bockade varor).

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
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: PARENT, account: ACCOUNT }],
};

function shoppingItem(overrides: Record<string, unknown>) {
  return { createdBy: "mem-1", done: false, deletedAt: null, deletedBy: null, ...overrides };
}

async function mockCommon(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
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
}

test("kan radera en enskild rad i inköpslistan", async ({ page }) => {
  await mockCommon(page);
  const list = {
    id: "shop-1", name: "Veckohandling", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null,
    items: [
      shoppingItem({ id: "item-mjolk", title: "Mjölk" }),
      shoppingItem({ id: "item-brod", title: "Bröd" }),
    ],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [list] }) : route.fulfill({ json: { id: list.id } })
  );
  let deleteCalled = false;
  await page.route("**/api/shopping/shop-1/items/item-mjolk", (route) => {
    deleteCalled = true;
    route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();

  await expect(page.getByText("Mjölk")).toBeVisible();
  await page.getByRole("button", { name: "Ta bort Mjölk" }).click();

  await expect(page.getByText("Mjölk")).toHaveCount(0);
  await expect(page.getByText("Bröd")).toBeVisible();
  expect(deleteCalled).toBe(true);
});

test("visningsläge för bockade varor: dölj och bockade-sist", async ({ page }) => {
  await mockCommon(page);
  const list = {
    id: "shop-2", name: "Fredagsmys", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null,
    items: [
      shoppingItem({ id: "item-chips", title: "Chips", done: true }),
      shoppingItem({ id: "item-lask", title: "Läsk", done: false }),
    ],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [list] }) : route.fulfill({ json: { id: list.id } })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();

  await expect(page.getByText("Chips")).toBeVisible();
  await expect(page.getByText("Läsk")).toBeVisible();

  const select = page.getByRole("combobox", { name: "Visning av bockade varor i Fredagsmys" });
  await select.selectOption("hidden");
  await expect(page.getByText("Chips")).toHaveCount(0);
  await expect(page.getByText("Läsk")).toBeVisible();

  await select.selectOption("bottom");
  await expect(page.getByText("Chips")).toBeVisible();
  const items = page.locator("li", { hasText: /Chips|Läsk/ });
  await expect(items.first()).toHaveText(/Läsk/);
  await expect(items.last()).toHaveText(/Chips/);
});

test("Töm listan rensar bara bockade varor", async ({ page }) => {
  await mockCommon(page);
  const list = {
    id: "shop-3", name: "Storhandling", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null,
    items: [
      shoppingItem({ id: "item-ost", title: "Ost", done: true }),
      shoppingItem({ id: "item-smor", title: "Smör", done: false }),
    ],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [list] }) : route.fulfill({ json: { id: list.id } })
  );
  let clearCalled = false;
  await page.route("**/api/shopping/shop-3/clear-completed", (route) => {
    clearCalled = true;
    route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();

  await expect(page.getByText("Ost")).toBeVisible();
  await page.getByRole("button", { name: "Töm bockade varor i Storhandling" }).click();

  await expect(page.getByText("Ost")).toHaveCount(0);
  await expect(page.getByText("Smör")).toBeVisible();
  expect(clearCalled).toBe(true);
});
