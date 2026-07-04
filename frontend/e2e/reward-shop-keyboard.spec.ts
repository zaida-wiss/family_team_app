import { test, expect, type Page } from "@playwright/test";

// S4 (Sprint 3): RewardShopModal-korten och plånbokens sedlar/mynt var enbart
// pekarbaserade (onPointerDown-drag + håll-in för gratisvaror) utan tangentbords-
// ekvivalent (WCAG 2.1.1). Fixat med samma Dra/Klicka-mönster som redan finns i
// ChildBanknotesModal/BankBreakdown: i klick-läge väljer man ett kort (Enter/Space),
// sen klickar/tangentbordsaktiverar man pengar i plånboken för att betala.

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
  approvedStars: 20, spentStars: 0, deletedAt: null, deletedBy: null,
};

const USER = { id: "user-child", email: "nova@exempel.se", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };

const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: CHILD, account: ACCOUNT }],
};

const PAID_ITEM = {
  id: "rsi-1", title: "Biobiljett", symbol: "🎬", starCost: 20, timerMinutes: null,
  availability: null, requiredCategories: [], createdBy: "mem-parent", deletedAt: null,
};

const FREE_ITEM = {
  id: "rsi-free", title: "Extra godnattsaga", symbol: "📖", starCost: 0, timerMinutes: null,
  availability: null, requiredCategories: [], createdBy: "mem-parent", deletedAt: null,
};

async function mockChildSession(page: Page, items: unknown[]) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items, requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
}

test.describe("Belöningsbutiken: tangentbordsläge", () => {
  test("klick-läge: välj kort med Enter, betala med Enter på plånbokens sedel", async ({ page }) => {
    let purchased = false;
    await mockChildSession(page, [PAID_ITEM]);
    await page.route("**/api/reward-shop/purchase/*", (route) => {
      purchased = true;
      return route.fulfill({ json: { ok: true } });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Shop" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "Klicka", exact: true }).click();

    const card = page.getByRole("button", { name: /Biobiljett/ });
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("aria-pressed", "true");

    const bill = page.getByRole("button", { name: "Lägg 20 kr på vald belöning" });
    await bill.focus();
    await page.keyboard.press("Enter");

    await expect.poll(() => purchased).toBe(true);
  });

  test("klick-läge: gratisvara hämtas med en Hämta-knapp, inget håll krävs", async ({ page }) => {
    let purchased = false;
    await mockChildSession(page, [FREE_ITEM]);
    await page.route("**/api/reward-shop/purchase/*", (route) => {
      purchased = true;
      return route.fulfill({ json: { ok: true } });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Shop" }).click();
    await page.getByRole("button", { name: "Klicka", exact: true }).click();

    await page.getByRole("button", { name: "Hämta" }).click();

    await expect.poll(() => purchased).toBe(true);
  });
});
