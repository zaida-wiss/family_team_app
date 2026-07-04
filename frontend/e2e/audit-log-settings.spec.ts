import { test, expect, type Page } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Sprint 5 S5: audit-logg-vy i Inställningar för stjärnor/köp/rolländringar (S4:s
// backend). Lista + filter per händelsetyp, gated bakom canManageMembers precis
// som backend-routen.

const ENTRIES = [
  { id: "audit-1", accountId: "acc-1", action: "stars_approved", actorMemberId: "mem-1", summary: "Godkände 5 stjärnor för \"Duka bordet\" (Nova)", createdAt: "2026-07-04T10:00:00.000Z" },
  { id: "audit-2", accountId: "acc-1", action: "reward_purchased", actorMemberId: "mem-2", summary: "Köpte \"Biobiljett\" (20 stjärnor)", createdAt: "2026-07-04T09:00:00.000Z" },
  { id: "audit-3", accountId: "acc-1", action: "role_permissions_changed", actorMemberId: "mem-1", summary: "Ändrade behörigheter för rollen \"Barn\" (canSeeOwnCalendar)", createdAt: "2026-07-04T08:00:00.000Z" },
];

test("Aktivitetslogg i Inställningar visar händelser och filtrerar per typ", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  await page.route(/\/api\/audit-log\?page=/, (route) =>
    route.fulfill({ json: { items: ENTRIES, page: 1, pageSize: 25, total: 3 } })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "🗂 Aktivitetslogg" }).click();

  await expect(page.getByText(/Godkände 5 stjärnor/)).toBeVisible();
  await expect(page.getByText(/Köpte "Biobiljett"/)).toBeVisible();
  await expect(page.getByText(/Ändrade behörigheter/)).toBeVisible();

  await page.getByLabel("Filtrera").selectOption("stars_approved");
  await expect(page.getByText(/Godkände 5 stjärnor/)).toBeVisible();
  await expect(page.getByText(/Köpte "Biobiljett"/)).not.toBeVisible();
  await expect(page.getByText(/Ändrade behörigheter/)).not.toBeVisible();
});

// "Övrig vuxen" — en icke-barn-medlem utan canManageMembers. Barn har ingen egen
// Inställningar-panel överhuvudtaget (ChildShellContent.tsx har ingen settings-vy
// alls), så det realistiska scenariot för att testa behörighetsspärren är en
// begränsad VUXEN-roll, inte ett barn.
const LIMITED_ACCOUNT = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-parent", deletedAt: null };

const LIMITED_ROLE = {
  id: "role-limited",
  name: "Övrig vuxen",
  isChildRole: false,
  permissions: {
    canManageMembers: false, canManageRoles: false,
    canSeeAllTodos: true, canSeeOwnTodos: true, canCreateTodos: true,
    canScheduleRecurringTodos: true, canCompleteAssignedTodos: true,
    canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: true,
    canSeeAllCalendar: true, canSeeOwnCalendar: true, canCreateCalendar: true,
    canEditCalendar: true, canImportCalendar: true, canExportCalendar: true,
    canSeeShoppingLists: true, canCreateShoppingLists: true, canEditShoppingLists: true,
    canViewTrash: false, canRestoreFromTrash: false,
    canCreateChildAccounts: false, canManageChildTodos: false,
  },
};

const LIMITED_MEMBER = {
  id: "mem-limited", accountId: "acc-1", userId: "user-limited",
  name: "Övrig förälder", roleId: "role-limited", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};

const LIMITED_USER = { id: "user-limited", email: "ovrig@exempel.se", name: "Övrig förälder", createdAt: "2024-01-01T00:00:00.000Z" };

const LIMITED_LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: LIMITED_USER,
  memberships: [{ member: LIMITED_MEMBER, account: LIMITED_ACCOUNT }],
};

async function mockLimitedAdultSession(page: Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LIMITED_LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [LIMITED_MEMBER] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [LIMITED_ROLE] }));
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
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
}

test("Vuxen utan canManageMembers ser ingen Aktivitetslogg-sektion och gör inget anrop", async ({ page }) => {
  let called = false;
  await mockLimitedAdultSession(page);
  await page.route(/\/api\/audit-log\?page=/, (route) => {
    called = true;
    return route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();

  await expect(page.getByRole("button", { name: "🗂 Aktivitetslogg" })).toHaveCount(0);
  expect(called).toBe(false);
});
