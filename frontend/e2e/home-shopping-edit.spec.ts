import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-16, Zaidas fynd: "Listor måste gå att redigera i familjens
// listvy. Där ska inga andra familjers listor synas om t.ex. det är 'wiss
// Kolmodin' som är vald att visas." Hem-vyns Inköp-flik (MemberOverview.tsx)
// var tidigare rent skrivskyddad (bara <li>{title}</li>, ingen bock-/lägg
// till-/ta bort-funktion) och SharedShoppingLists.tsx (en annan familjs
// direkt delade lista, ADR-0026) visades alltid oavsett vald familj i
// filtret. Se CLAUDE.md samma dag för hela bakgrunden.

const ACCOUNT = { id: "acc-a", name: "Familjen A", type: "family", createdBy: "mem-a", deletedAt: null };
const ROLE = {
  id: "role-1", name: "Förälder", isChildRole: false,
  permissions: {
    canManageMembers: true, canManageRoles: true, canSeeAllTodos: true, canSeeOwnTodos: true, canCreateTodos: true,
    canScheduleRecurringTodos: true, canCompleteAssignedTodos: true, canEditAnyTodos: true, canDeleteAnyTodos: true,
    canApproveTodos: true, canSeeAllCalendar: true, canSeeOwnCalendar: true, canCreateCalendar: true,
    canEditCalendar: true, canImportCalendar: true, canExportCalendar: true, canSeeShoppingLists: true,
    canCreateShoppingLists: true, canEditShoppingLists: true, canViewTrash: true, canRestoreFromTrash: true,
    canCreateChildAccounts: true, canManageChildTodos: true
  }
};
const MEMBER_A = {
  id: "mem-a", accountId: "acc-a", userId: "user-1", name: "Förälder A", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Förälder A", createdAt: "2024-01-01T00:00:00.000Z" };

function shoppingList(overrides: Record<string, unknown>) {
  return {
    id: "list-1", name: "Veckohandling", ownerId: "mem-a", color: "#2f7d6d", icon: null,
    sharedWith: [], deletedAt: null, deletedBy: null,
    items: [{ id: "item-1", title: "Mjölk", createdBy: "mem-a", done: false, deletedAt: null, deletedBy: null }],
    ...overrides
  };
}

async function selectFamily(page: import("@playwright/test").Page, tab: import("@playwright/test").Locator, label: string) {
  // Familjeväljaren ligger sedan 2026-08-29 i Hem-panelens nya standardvy
  // (ingen egen "Visa medlemmar"-flik längre) — ett klick på Hem landar
  // alltid där, oavsett aktiv Hem-flik.
  await page.getByRole("button", { name: "Hem", exact: true }).click();
  await page.getByLabel("Familjeval").getByRole("button", { name: label }).click();
  await tab.click();
}

test("Hem-vyns Inköp-flik: varor går att bocka av, lägga till och ta bort i egen familj och Mina familjekonton, men inte i en Familjeanslutning", async ({ page }) => {
  let ownToggleCalled = false;
  let ownAddedTitle: string | null = null;
  let ownDeletedItemId: string | null = null;
  let crossToggleCalled = false;
  let crossAddedTitle: string | null = null;
  let crossDeletedItemId: string | null = null;

  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fake-access-token", user: USER, memberships: [{ member: MEMBER_A, account: ACCOUNT }] } })
  );
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER_A] }));

  await page.route("**/api/shopping", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [shoppingList({ id: "list-a", name: "Familjen A-lista" })] });
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/shopping/list-a/items/item-1/toggle", (route) => {
    ownToggleCalled = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/shopping/list-a/items", (route) => {
    ownAddedTitle = (route.request().postDataJSON() as { title: string }).title;
    return route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.route("**/api/shopping/list-a/items/item-1", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    ownDeletedItemId = "item-1";
    return route.fulfill({ json: { ok: true } });
  });

  await page.route("**/api/shopping/cross-account", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", lists: [shoppingList({ id: "list-b", name: "Familjen B-lista", accountId: "acc-b" })] }] })
  );
  await page.route("**/api/shopping/cross-account/acc-b/list-b/items/item-1/toggle", (route) => {
    crossToggleCalled = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/shopping/cross-account/acc-b/list-b/items", (route) => {
    crossAddedTitle = (route.request().postDataJSON() as { title: string }).title;
    return route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.route("**/api/shopping/cross-account/acc-b/list-b/items/item-1", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    crossDeletedItemId = "item-1";
    return route.fulfill({ json: { ok: true } });
  });

  // Familjen C — bara en Familjeanslutning, aldrig redigerbar (samma
  // "bara läsbar sammanfattning"-princip som gäller todos/recept där).
  await page.route("**/api/shopping/connections", (route) =>
    route.fulfill({ json: [{ accountId: "acc-c", accountName: "Familjen C", lists: [shoppingList({ id: "list-c", name: "Familjen C-lista", accountId: "acc-c" })] }] })
  );

  await page.goto("/");
  const shoppingTab = page.getByRole("tab", { name: "Visa inköpslista" });
  await shoppingTab.click();

  // Egen familj — checkbox/lägg till/ta bort ska fungera.
  await selectFamily(page, shoppingTab, "Familjen A");
  const ownItem = page.getByRole("listitem").filter({ hasText: "Mjölk" });
  await ownItem.getByRole("checkbox").click();
  await expect.poll(() => ownToggleCalled).toBe(true);
  await page.getByPlaceholder("Lägg till vara").fill("Bröd");
  await page.getByPlaceholder("Lägg till vara").press("Enter");
  await expect.poll(() => ownAddedTitle).toBe("Bröd");
  await ownItem.getByRole("button", { name: "Ta bort Mjölk" }).click();
  await expect.poll(() => ownDeletedItemId).toBe("item-1");

  // Mina familjekonton (Familjen B) — samma funktioner, egen cross-account-väg.
  await selectFamily(page, shoppingTab, "Familjen B");
  const crossItem = page.getByRole("listitem").filter({ hasText: "Mjölk" });
  await crossItem.getByRole("checkbox").click();
  await expect.poll(() => crossToggleCalled).toBe(true);
  await page.getByPlaceholder("Lägg till vara").fill("Ost");
  await page.getByPlaceholder("Lägg till vara").press("Enter");
  await expect.poll(() => crossAddedTitle).toBe("Ost");
  await crossItem.getByRole("button", { name: "Ta bort Mjölk" }).click();
  await expect.poll(() => crossDeletedItemId).toBe("item-1");

  // Familjen C — bara en Familjeanslutning: checkboxen är inaktiverad,
  // ingen ta bort-knapp eller lägg till-formulär.
  await selectFamily(page, shoppingTab, "Familjen C");
  const connectionItem = page.getByRole("listitem").filter({ hasText: "Mjölk" });
  await expect(connectionItem.getByRole("checkbox")).toBeDisabled();
  await expect(connectionItem.getByRole("button", { name: "Ta bort Mjölk" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Lägg till vara")).toHaveCount(0);
});

test("Hem-vyns Inköp-flik: en annan familjs delade lista (ADR-0026) döljs när en specifik familj är vald i filtret", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fake-access-token", user: USER, memberships: [{ member: MEMBER_A, account: ACCOUNT }] } })
  );
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER_A] }));
  await page.route("**/api/shopping", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping/cross-account", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", lists: [] }] })
  );
  // En lista delad med mig av en HELT ANNAN familj (wiss Kolmodin i Zaidas
  // exempel) — varken mitt eget konto eller ett av Mina familjekonton.
  await page.route("**/api/shopping/shared-lists", (route) =>
    route.fulfill({
      json: [{
        list: { id: "list-x", accountId: "acc-x", name: "wiss Kolmodins lista", color: "#2f7d6d", icon: null, items: [] },
        access: "view"
      }]
    })
  );

  await page.goto("/");
  const shoppingTab = page.getByRole("tab", { name: "Visa inköpslista" });
  await shoppingTab.click();

  // "Alla familjer" (standard) — den delade listan syns.
  await expect(page.getByText("wiss Kolmodins lista")).toBeVisible();

  // En SPECIFIK familj vald (varken ägaren till den delade listan eller
  // min egen) — listan ska försvinna helt, inte läcka in oavsett vad som
  // är valt.
  await selectFamily(page, shoppingTab, "Familjen A");
  await expect(page.getByText("wiss Kolmodins lista")).toHaveCount(0);

  await selectFamily(page, shoppingTab, "Familjen B");
  await expect(page.getByText("wiss Kolmodins lista")).toHaveCount(0);

  // Tillbaka till "Alla familjer" — listan syns igen.
  await page.getByRole("button", { name: "Hem", exact: true }).click();
  await page.getByLabel("Familjeval").getByRole("button", { name: "Alla familjer" }).click();
  await shoppingTab.click();
  await expect(page.getByText("wiss Kolmodins lista")).toBeVisible();
});
