import type { Page } from "@playwright/test";

const ACCOUNT = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null };
const ROLE = {
  id: "role-1",
  name: "Förälder",
  isChildRole: false,
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
const MEMBER = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };

export const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: MEMBER, account: ACCOUNT }],
};

// mockDataAPIs — mock:ar bara datanropen (inte auth/refresh).
// Används när testet hanterar auth separat.
export async function mockDataAPIs(page: Page) {
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  // Matchar även /api/members/:id (t.ex. update/restore/remove) — utan denna
  // föll anrop som membersApi.update() (bl.a. lastActivePanel-persistering vid
  // panelbyte) igenom till en riktig, ej mockad backend och gav ett äkta 401
  // (ogiltig fake-access-token), vilket triggade "Sessionen kunde inte förnyas".
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  // SSE-strömmen för todo-ändringar — utan denna faller den igenom till en riktig
  // backend och 401:ar (ofarligt i sig, men brusigt och kan racea med riktiga tester).
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
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
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
}

// mockAuthAndData — simulerar en redan inloggad användare vid sidladdning.
// refresh returnerar giltig session → inloggningsformuläret visas aldrig.
export async function mockAuthAndData(page: Page) {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: LOGIN_RESPONSE })
  );
  await mockDataAPIs(page);
}

// mockUnauthenticated — refresh returnerar 401 → inloggningsformuläret visas.
export async function mockUnauthenticated(page: Page) {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: { error: "Ej autentiserad" } })
  );
}

// loginViaUI — fyll i och skicka inloggningsformuläret med mock:at API-svar.
// Kräver att mockUnauthenticated + mockDataAPIs redan är satta upp.
export async function loginViaUI(page: Page) {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ json: LOGIN_RESPONSE })
  );
  await page.getByLabel("E-postadress").fill("test@exempel.se");
  await page.getByLabel("Lösenord").fill("lösenord123");
  await page.getByRole("button", { name: "Logga in" }).click();
}
