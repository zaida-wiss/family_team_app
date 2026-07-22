import { test, expect } from "@playwright/test";

// Zaida (2026-07-22): "vi behöver även lösa hur ett barn skall kunna logga
// in på sitt egna konto... de ska få användarnamn till familjen som är
// unika... inget mejl, återställning görs via föräldrarnas mail". Testar
// hela loopen: föräldern skapar barnets inloggning i Inställningar →
// Konto & familj → Familjemedlemmar, loggar ut, och barnet loggar in via
// den nya "Logga in som barn"-vyn (förälderns e-post + username + lösenord).

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
const PARENT_USER = { id: "user-1", email: "foralder@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const CHILD_USER = { id: "user-child", email: null, username: "nova", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };

const PARENT_LOGIN_RESPONSE = {
  accessToken: "parent-access-token",
  user: PARENT_USER,
  memberships: [{ member: PARENT, account: ACCOUNT }],
};
const CHILD_LOGIN_RESPONSE = {
  accessToken: "child-access-token",
  user: CHILD_USER,
  memberships: [{ member: CHILD, account: ACCOUNT }],
};

test("förälder skapar barnets inloggning, barnet loggar in och ser sin dashboard", async ({ page }) => {
  let loggedOut = false;
  let credentialsSet = false;

  await page.route("**/api/auth/refresh", (route) => {
    if (loggedOut) return route.fulfill({ status: 401, json: { error: "Inte autentiserad" } });
    return route.fulfill({ json: PARENT_LOGIN_RESPONSE });
  });
  await page.route("**/api/auth/logout", (route) => {
    loggedOut = true;
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/auth/child-login", (route) => {
    const body = route.request().postDataJSON() as { parentEmail: string; username: string; password: string };
    if (body.parentEmail === PARENT_USER.email && body.username.toLowerCase() === "nova" && body.password === "sommar2026") {
      return route.fulfill({ json: CHILD_LOGIN_RESPONSE });
    }
    return route.fulfill({ status: 401, json: { error: "Fel uppgifter" } });
  });
  await page.route("**/api/members", (route) => {
    // Barnvyn (ChildShellContent) hämtar inte /api/members alls, men
    // förälderns Inställningar-panel gör det — samma lista räcker för båda.
    route.fulfill({ json: [PARENT, CHILD] });
  });
  await page.route("**/api/members/mem-child/credentials", (route) => {
    credentialsSet = true;
    route.fulfill({ json: { id: "user-child", username: "nova" } });
  });
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
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));

  await page.goto("/");

  // Förälder: skapa barnets inloggning i Inställningar → Konto & familj → Familjemedlemmar.
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Konto & familj" }).click();
  await page.getByRole("button", { name: "Familjemedlemmar" }).click();
  await page.getByRole("button", { name: "Redigera Nova" }).click();
  await page.getByPlaceholder("t.ex. nova").fill("Nova");
  await page.getByPlaceholder("Minst 4 tecken").fill("sommar2026");
  await page.getByRole("button", { name: "Spara inloggning" }).click();
  await expect(page.getByText("Inloggning sparad.")).toBeVisible();
  expect(credentialsSet).toBe(true);
  await page.getByRole("button", { name: "Stäng" }).click();

  // Logga ut (tillbaka till underkategori-listan via brödsmulan, sedan Logga ut).
  await page.getByRole("button", { name: "Konto & familj" }).click();
  await page.getByRole("button", { name: "Logga ut", exact: true }).click();
  await page.getByRole("button", { name: "Logga ut från Familjeappen" }).click();
  await expect(page.locator("p.eyebrow", { hasText: "Logga in" })).toBeVisible();

  // Barnet loggar in via "Logga in som barn".
  await page.getByRole("button", { name: "Logga in som barn" }).click();
  await page.getByPlaceholder("förälderns namn@exempel.se").fill(PARENT_USER.email);
  await page.getByPlaceholder("Ditt användarnamn").fill("Nova");
  await page.locator('input[type="password"]').fill("sommar2026");
  await page.getByRole("button", { name: "Logga in" }).click();

  await expect(page.getByText("Hej Nova!")).toBeVisible();
});

test("barn-inloggning visar felmeddelande vid fel uppgifter", async ({ page }) => {
  // client.ts kastar alltid "Inte autentiserad" vid 401 oavsett serverns
  // JSON-felmeddelande (samma dokumenterade, redan existerande beteende som
  // adult-inloggningen — se auth.spec.ts:s motsvarande test).
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: { error: "Inte autentiserad" } }));
  await page.route("**/api/auth/child-login", (route) =>
    route.fulfill({ status: 401, json: { error: "Fel uppgifter" } })
  );

  await page.goto("/");
  await expect(page.locator("p.eyebrow", { hasText: "Logga in" })).toBeVisible();
  await page.getByRole("button", { name: "Logga in som barn" }).click();
  await page.getByPlaceholder("förälderns namn@exempel.se").fill("fel@exempel.se");
  await page.getByPlaceholder("Ditt användarnamn").fill("finnsinte");
  await page.locator('input[type="password"]').fill("felaktigt");
  await page.getByRole("button", { name: "Logga in" }).click();

  await expect(page.getByRole("alert")).toContainText("Inte autentiserad");
});
