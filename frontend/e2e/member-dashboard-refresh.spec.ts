import { test, expect } from "@playwright/test";

// Ursprungligen (2026-07-06): "om jag står på barnets sida och refreshar
// sidan så åker jag till kalendervyn. Jag ska egentligen stå kvar på samma
// ställe efter en refresh" — löst genom att återläsa
// lastSelectedDashboardMemberId vid mount (som redan sparades korrekt, bara
// aldrig lästes tillbaka).
//
// Omskrivet 2026-07-23 efter Zaidas nya beslut ("endast medlemmar symbolen
// som skall vara markerad... Klickar vi på hemmet eller kalendern så ska det
// inte längre vara barnvyn"): ett medlemsval visas nu bara på Medlemmar-
// panelen (activePanel="members"), inte på Hem — så den URSPRUNGLIGA testets
// premiss (reload med lastActivePanel="home" + ett barn valt ska visa
// barnets dashboard) är inte längre korrekt. Två test nu:
// 1) Gammal, redan persisterad data (lastActivePanel="home" från FÖRE denna
//    ändring, då MembersView.tsx alltid navigerade dit vid ett val) ska INTE
//    läcka igenom längre — en sidomladdning ska visa förälderns EGEN hemvy,
//    inte fastna på barnets dashboard med fel nav-ikon markerad
//    (MemberShellContent.tsx:s nya activePanel==="members"-spärr).
// 2) Den NYA, korrekta vägen: lastActivePanel="members" (vilket är vad en
//    riktig medlemsväljning nu faktiskt sparar) ska stå kvar på barnets
//    dashboard efter en sidomladdning, med Medlemmar-ikonen markerad.

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

const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };

async function mockCommon(page: import("@playwright/test").Page, parent: Record<string, unknown>) {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "tok", user: USER, memberships: [{ member: parent, account: ACCOUNT }] } })
  );
  await page.route("**/api/members", (route) => route.fulfill({ json: [parent, CHILD] }));
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

test("gammal persisterad lastActivePanel=home + ett kvarvarande medlemsval visar INTE längre barnets dashboard", async ({ page }) => {
  const parent = {
    id: "mem-1", accountId: "acc-1", userId: "user-1",
    name: "Testförälder", roleId: "role-1", isChild: false,
    avatarUrl: null, color: null, dashboardTheme: null,
    spentStars: 0, deletedAt: null, deletedBy: null,
    lastActivePanel: "home", lastSelectedDashboardMemberId: "mem-child",
  };
  await mockCommon(page, parent);

  await page.goto("/");

  await expect(page.getByText(`Hej ${CHILD.name}!`)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hem" })).toHaveClass(/active/);
});

test("lastActivePanel=members + ett medlemsval stannar kvar på barnets dashboard efter en sidomladdning", async ({ page }) => {
  const parent = {
    id: "mem-1", accountId: "acc-1", userId: "user-1",
    name: "Testförälder", roleId: "role-1", isChild: false,
    avatarUrl: null, color: null, dashboardTheme: null,
    spentStars: 0, deletedAt: null, deletedBy: null,
    lastActivePanel: "members", lastSelectedDashboardMemberId: "mem-child",
  };
  await mockCommon(page, parent);

  await page.goto("/");

  await expect(page.getByText(`Hej ${CHILD.name}!`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Medlemmar" })).toHaveClass(/active/);
});
