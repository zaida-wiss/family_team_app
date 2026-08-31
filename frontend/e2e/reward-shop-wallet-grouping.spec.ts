import { test, expect, type Page } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-31: Plånbokens sedlar/mynt staplades tidigare som N helt separata, mest dolda
// bildelement per valör (t.ex. 23 enskilda 10-kronorsmynt) — tar oproportionerligt mycket
// plats vid stora antal och går inte att räkna i ett svep. stackDisplayGroups() (bankDenoms.ts)
// bryter nu ut hela tior till en kompakt, sammanslagen "myntstapel/sedelbunt"-markör (kant/höjd-
// vy, ej myntsidan — grundad med skugga, inte svävande) och lämnar en rest på 0-9 som vanliga
// tätt överlappande enskilda sedlar/mynt, med en luftig lucka var femte för att kunna räknas i
// femtal. Se RewardShopModal.tsx/.css och BankWallet.tsx/ChildBanknotesModal.css.

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

// 10 kr: 23 st -> 2 hela tior + rest 3. 5 kr: 7 st -> 0 tior + rest 7 (lucka vid 6:e).
const COUNTS = { 5: 7, 10: 23 };
const SAVED_TOTAL = 5 * 7 + 10 * 23; // 265

const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  approvedStars: SAVED_TOTAL, spentStars: 0, deletedAt: null, deletedBy: null,
};

const USER = { id: "user-child", email: "nova@exempel.se", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };

const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: CHILD, account: ACCOUNT }],
};

async function mockChildSession(page: Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  // Direkt injicerad plånboksfördelning (istället för att härleda ur stjärnor) — den giriga
  // denomCounts()-algoritmen kan aldrig själv producera >=10 av samma valör (nästa högre valör
  // sätter alltid ett lägre naturligt tak), så en stor stapel av samma valör kräver antingen
  // ackumulering över tid (reconcileCounts) eller, som här, en direkt satt localStorage-post.
  await page.addInitScript(
    ({ counts, savedTotal }) => {
      localStorage.setItem("bank-counts-mem-child", JSON.stringify({ counts, savedTotal }));
    },
    { counts: COUNTS, savedTotal: SAVED_TOTAL }
  );
}

test.describe("Plånbokens kompakta gruppering (tior/femtal)", () => {
  test("23 st 10-kronorsmynt visas som 2 tiabuntar + 3 enskilda mynt, inte 23 separata", async ({ page }) => {
    await mockChildSession(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Shop" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const tenBundles = page.locator('.shop-coin-tenstack[data-coin="10"]');
    await expect(tenBundles).toHaveCount(2);
    await expect(tenBundles.first().locator(".shop-coin-tenstack__badge")).toHaveText("10");

    const individualCoins = page.locator('.shop-coin-clip[data-coin="10"]');
    await expect(individualCoins).toHaveCount(3);
  });

  test("7 st 5-kronorsmynt får en luftig lucka efter det femte, ingen tiabunt", async ({ page }) => {
    await mockChildSession(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Shop" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await expect(page.locator('.shop-coin-tenstack[data-coin="5"]')).toHaveCount(0);
    const coins5 = page.locator('.shop-coin-clip[data-coin="5"]');
    await expect(coins5).toHaveCount(7);
    // Sjätte myntet (index 5) markerar femtal-gränsen med en lucka istället för tät stapling
    await expect(coins5.nth(5)).toHaveClass(/shop-coin-seam/);
    await expect(coins5.nth(4)).not.toHaveClass(/shop-coin-seam/);
  });

  test("samma gruppering syns i den fristående plånboken (BankWallet)", async ({ page }) => {
    await mockChildSession(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Plånbok —/ }).click();
    await expect(page.locator(".bm-sheet")).toBeVisible();

    await expect(page.locator('.bm-coin-tenstack[data-coin="10"]')).toHaveCount(2);
    await expect(page.locator('.bm-coin-clip[data-coin="10"]')).toHaveCount(3);
  });
});
