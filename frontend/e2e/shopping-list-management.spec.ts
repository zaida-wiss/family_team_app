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
const OTHER_ADULT = {
  id: "mem-2", accountId: "acc-1", userId: "user-2",
  name: "Andra föräldern", roleId: "role-1", isChild: false,
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
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, OTHER_ADULT] }));
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

  await page.getByRole("switch", { name: "Visa avklarade" }).click();
  await expect(page.getByText("Chips")).toHaveCount(0);
  await expect(page.getByText("Läsk")).toBeVisible();
});

// 2026-07-27, Zaidas fynd: "sparas inställningen om jag växlar vy... det ska
// sparas på enheten" — växeln var tidigare bara lokal komponent-state,
// nollställdes vid ny sidomladdning/panelbyte. Sparas nu i localStorage.
test("Visa avklarade-valet sparas på enheten, överlever en omladdning", async ({ page }) => {
  await mockCommon(page);
  const list = {
    id: "shop-3", name: "Veckohandling", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null,
    items: [shoppingItem({ id: "item-ost", title: "Ost", done: true })],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [list] }) : route.fulfill({ json: { id: list.id } })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();
  await expect(page.getByText("Ost")).toBeVisible();

  await page.getByRole("switch", { name: "Visa avklarade" }).click();
  await expect(page.getByText("Ost")).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Inköp" }).click();
  await expect(page.getByText("Ost")).toHaveCount(0);
});

// 2026-07-27, Zaidas önskemål: "defaultläge skall gå att ställa in under
// inköpslistorna i inställningarna" — gäller bara listor UTAN ett eget,
// redan sparat val på just den här enheten (ren localStorage, en ny lista
// har aldrig ett värde där).
test("Standardläget för Visa avklarade i Inställningar styr en lista utan eget sparat val", async ({ page }) => {
  await mockCommon(page);
  const list = {
    id: "shop-4", name: "Veckohandling", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null,
    items: [shoppingItem({ id: "item-smor", title: "Smör", done: true })],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [list] }) : route.fulfill({ json: { id: list.id } })
  );
  let savedDefault: boolean | null = null;
  await page.route("**/api/members/mem-1", (route) => {
    const body = route.request().postDataJSON() as { shoppingShowCompletedDefault?: boolean };
    if (body.shoppingShowCompletedDefault !== undefined) savedDefault = body.shoppingShowCompletedDefault;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Inköpslistor" }).click();
  await page.getByLabel("Visa avklarade som standard").uncheck();
  await expect.poll(() => savedDefault).toBe(false);

  await page.getByRole("button", { name: "Inköp", exact: true }).click();
  await expect(page.getByText("Smör")).toHaveCount(0);
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

// 2026-07-22, Zaidas önskemål: "vi ska även kunna göra nya listor och välja
// symbol till dessa i shoppingvyn, samt dela listan med andra
// familjemedlemmar." — tidigare gick det bara att skapa/dela listor via
// Inställningar → Inköpslistor, inte i själva Inköp-panelen.
test("kan skapa en ny lista med en vald symbol direkt i Inköp-panelen", async ({ page }) => {
  await mockCommon(page);
  let createdBody: Record<string, unknown> | null = null;
  await page.route("**/api/shopping", (route) => {
    if (route.request().method() === "POST") {
      createdBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdBody.id } });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();
  await page.getByRole("button", { name: "Ny lista" }).click();
  await page.getByPlaceholder("Namn på listan").fill("Skolstart");
  await page.getByRole("button", { name: "Skapa lista" }).click();

  expect(createdBody).not.toBeNull();
  expect((createdBody as { name: string }).name).toBe("Skolstart");
});

test("kan dela en lista med en annan familjemedlem direkt i Inköp-panelen", async ({ page }) => {
  await mockCommon(page);
  const list = {
    id: "shop-5", name: "Delad lista", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null, items: [],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [list] }) : route.fulfill({ json: { id: list.id } })
  );
  let shareBody: Record<string, unknown> | null = null;
  await page.route("**/api/shopping/shop-5/share", (route) => {
    shareBody = route.request().postDataJSON() as Record<string, unknown>;
    route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();
  await page.getByRole("button", { name: "Dela Delad lista" }).click();
  await page.getByLabel("Välj medlem att dela med").selectOption("mem-2");
  await page.getByRole("button", { name: "Dela lista" }).click();

  expect(shareBody).toEqual({ memberId: "mem-2", access: "view" });
});

// Zaida (2026-07-26): "inköpslistorna måste gå att radera. Ingenting skall
// gå att radera om man inte trycker redigera först. Inköpslistan måste gå
// att drag and droppa ordningen på varorna och att slå ihop två
// inköpslistor." Tre nya delar i Inköp-panelen (listradering fanns redan,
// men bara i Inställningar → Inköpslistor, inte här).

test("kan radera en hel inköpslista i redigeringsläge, kräver bekräftelse", async ({ page }) => {
  await mockCommon(page);
  const list = {
    id: "shop-1", name: "Veckohandling", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null, items: [],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [list] }) : route.fulfill({ json: { id: list.id } })
  );
  let deleteCalled = false;
  await page.route("**/api/shopping/shop-1", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deleteCalled = true;
    route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();
  await expect(page.getByText("Veckohandling")).toBeVisible();
  await expect(page.getByRole("button", { name: "Radera Veckohandling" })).toHaveCount(0);

  await page.getByRole("button", { name: "Redigera" }).click();
  await page.getByRole("button", { name: "Radera Veckohandling" }).click();
  await page.getByRole("button", { name: "Bekräfta radering av Veckohandling" }).click();

  expect(deleteCalled).toBe(true);
  await expect(page.getByText("Veckohandling")).toHaveCount(0);
});

test("kan dra och släppa för att ändra ordning på varorna i redigeringsläge", async ({ page }) => {
  await mockCommon(page);
  const list = {
    id: "shop-1", name: "Veckohandling", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null,
    items: [
      shoppingItem({ id: "item-mjolk", title: "Mjölk" }),
      shoppingItem({ id: "item-brod", title: "Bröd" }),
      shoppingItem({ id: "item-agg", title: "Ägg" }),
    ],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [list] }) : route.fulfill({ json: { id: list.id } })
  );
  let reorderedIds: string[] | null = null;
  await page.route("**/api/shopping/shop-1/items/reorder", (route) => {
    reorderedIds = (route.request().postDataJSON() as { itemIds: string[] }).itemIds;
    route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();
  await page.getByRole("button", { name: "Redigera" }).click();

  const mjolkHandle = page.locator('[data-item-id="item-mjolk"]').getByRole("button", { name: /Dra för att flytta/ });
  const aggRow = page.locator('[data-item-id="item-agg"]');
  const handleBox = await mjolkHandle.boundingBox();
  const targetBox = await aggRow.boundingBox();
  if (!handleBox || !targetBox) throw new Error("Saknar bounding box för drag-testet");

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => reorderedIds).not.toBeNull();
  expect(reorderedIds).toEqual(["item-brod", "item-agg", "item-mjolk"]);
});

test("kan slå ihop två inköpslistor i redigeringsläge", async ({ page }) => {
  await mockCommon(page);
  const listA = {
    id: "shop-1", name: "Veckohandling", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null,
    items: [shoppingItem({ id: "item-mjolk", title: "Mjölk" })],
  };
  const listB = {
    id: "shop-2", name: "Fest", ownerId: "mem-1", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null, items: [],
  };
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [listA, listB] }) : route.fulfill({ json: { id: "new" } })
  );
  let addedTitle: string | null = null;
  await page.route("**/api/shopping/shop-2/items", (route) => {
    addedTitle = (route.request().postDataJSON() as { title: string }).title;
    route.fulfill({ json: { ok: true } });
  });
  let deleteCalled = false;
  await page.route("**/api/shopping/shop-1", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deleteCalled = true;
    route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();

  const veckoCard = page.locator("article", { hasText: "Veckohandling" });
  await veckoCard.getByRole("button", { name: "Redigera" }).click();
  await veckoCard.getByRole("button", { name: "Slå ihop Veckohandling med en annan lista" }).click();
  await veckoCard.getByLabel("Slå ihop Veckohandling med", { exact: true }).selectOption("shop-2");
  await veckoCard.getByRole("button", { name: "Slå ihop Veckohandling in i vald lista" }).click();

  await expect.poll(() => addedTitle).not.toBeNull();
  expect(addedTitle).toBe("Mjölk");
  expect(deleteCalled).toBe(true);
  await expect(page.getByText("Veckohandling")).toHaveCount(0);
});
