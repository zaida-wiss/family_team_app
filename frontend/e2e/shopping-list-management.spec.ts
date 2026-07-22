import { test, expect } from "@playwright/test";

// Zaida (2026-07-22): "vi behöver kunna radera inköpslistor och rader i
// inköpslistan, samt välja att dölja gjorda rader, alternativt placera
// överstrukna rader längst ner", följt av "töm listan kan vara ett val".
// Listradering fanns redan (Inställningar → Inköpslistor). Testar de tre NYA
// delarna: radera enskild rad (bara i redigeringsläge, se nedan), en enda
// av/på-toggle för bockade varor (visas alltid sist när på, inte en
// tre-lägen-väljare), och Töm listan (rensar bara bockade varor).
//
// Uppföljning samma dag (Zaidas begäran: "tänk minimalistiskt"): raderaknappen
// per rad ligger bakom en Redigera-knapp istället för att alltid synas, och
// visningsvalet förenklat till en enda toggle (bort/på) — bockade varor
// hamnar automatiskt sist när de visas, ingen separat "bockade sist"-läge.

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

test("kan radera en enskild rad i inköpslistan, bara i redigeringsläge", async ({ page }) => {
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
  await expect(page.getByRole("button", { name: "Ta bort Mjölk" })).toHaveCount(0);

  await page.getByRole("button", { name: "Redigera" }).click();
  await page.getByRole("button", { name: "Ta bort Mjölk" }).click();

  await expect(page.getByText("Mjölk")).toHaveCount(0);
  await expect(page.getByText("Bröd")).toBeVisible();
  expect(deleteCalled).toBe(true);
});

test("bockade varor hamnar sist när de visas, kan döljas med en toggle", async ({ page }) => {
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

  // Standard: bockade visas, men alltid sist (Chips är bockad, kom först i API-svaret).
  await expect(page.getByText("Chips")).toBeVisible();
  await expect(page.getByText("Läsk")).toBeVisible();
  const items = page.locator("li", { hasText: /Chips|Läsk/ });
  await expect(items.first()).toHaveText(/Läsk/);
  await expect(items.last()).toHaveText(/Chips/);

  await page.getByRole("button", { name: "Visa avklarade" }).click();
  await expect(page.getByText("Chips")).toHaveCount(0);
  await expect(page.getByText("Läsk")).toBeVisible();
});

test("Töm listan (i redigeringsläge) rensar bara bockade varor", async ({ page }) => {
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
  await expect(page.getByRole("button", { name: "Töm bockade varor i Storhandling" })).toHaveCount(0);

  await page.getByRole("button", { name: "Redigera" }).click();
  await page.getByRole("button", { name: "Töm bockade varor i Storhandling" }).click();

  await expect(page.getByText("Ost")).toHaveCount(0);
  await expect(page.getByText("Smör")).toBeVisible();
  expect(clearCalled).toBe(true);
});

test("bockar bara av en vara genom att klicka på kryssrutan, inte genom att klicka på texten", async ({ page }) => {
  await mockCommon(page);
  const list = {
    id: "shop-4", name: "Klick-test", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null,
    items: [shoppingItem({ id: "item-agg", title: "Ägg" })],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [list] }) : route.fulfill({ json: { id: list.id } })
  );
  let toggleCalled = false;
  await page.route("**/api/shopping/shop-4/items/item-agg/toggle", (route) => {
    toggleCalled = true;
    route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();

  // Klick på själva texten ska INTE bocka av — bara kryssrutan.
  await page.getByText("Ägg", { exact: true }).click();
  expect(toggleCalled).toBe(false);

  await page.getByRole("checkbox", { name: "Ägg" }).click();
  expect(toggleCalled).toBe(true);
});
