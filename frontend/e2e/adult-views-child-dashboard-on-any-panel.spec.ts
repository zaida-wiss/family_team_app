import { test, expect } from "@playwright/test";

// Zaida (2026-07-23): "När vi är på denna [barnvyn/medlemsvyn] så är det
// endast medlemmar symbolen som skall vara markerad. Klickar vi på hemmet
// eller kalendern så ska det inte längre vara barnvyn." — reverserar
// 2026-07-22-beslutet (som testades av just den här filen tidigare): att
// välja ett barn i Medlemmar-panelen lät tidigare Kalender/Todos/Inköp/Hem
// FORTSÄTTA visa barnets dashboard, med FEL nav-ikon markerad som aktiv.
// Nu: ett val av en medlem (MembersView.tsx:s kort) visas bara HÄR, i
// Medlemmar-panelen (activePanel förblir "members", se Shell.tsx:s
// PanelRouter) — varje annat nav-klick (inklusive Medlemmar-ikonen igen)
// rensar valet (useAppState.ts:s setActivePanel), vilket fungerar som en
// implicit "tillbaka till min egen vy"-väg.

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
const CHILD_ROLE = { ...ROLE, id: "role-child", name: "Barn", isChildRole: true };

const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: PARENT, account: ACCOUNT }],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE, CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
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
  await page.route("**/api/todo-templates/**", (route) => route.fulfill({ json: [] }));
}

async function selectChild(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Medlemmar" }).click();
  await page.getByRole("button", { name: /Nova/ }).click();
  await expect(page.getByText("Hej Nova!")).toBeVisible();
}

for (const [panelLabel] of [["Hem"], ["Kalender"], ["Todos"], ["Inköp"]] as const) {
  test(`Vuxen som valt ett barn och klickar ${panelLabel} ser sin EGEN vy, inte barnets dashboard`, async ({ page }) => {
    await mockCommon(page);
    await selectChild(page);

    await page.getByRole("button", { name: panelLabel }).click();

    await expect(page.getByText("Hej Nova!")).toHaveCount(0);
  });
}

test("Medlemmar-ikonen är den enda markerade så länge man tittar på en vald medlems vy", async ({ page }) => {
  await mockCommon(page);
  await selectChild(page);

  const membersBtn = page.getByRole("button", { name: "Medlemmar" });
  await expect(membersBtn).toHaveClass(/active/);

  const homeBtn = page.getByRole("button", { name: "Hem" });
  await expect(homeBtn).not.toHaveClass(/active/);
});

test("Ett andra klick på Medlemmar-ikonen tar tillbaka till medlemslistan (avväljer)", async ({ page }) => {
  await mockCommon(page);
  await selectChild(page);

  await page.getByRole("button", { name: "Medlemmar" }).click();

  await expect(page.getByText("Hej Nova!")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Nova/ })).toBeVisible();
});
