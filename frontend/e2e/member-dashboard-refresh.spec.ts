import { test, expect } from "@playwright/test";

// Zaida: "om jag står på barnets sida och refreshar sidan så åker jag till
// kalendervyn. Jag ska egentligen stå kvar på samma ställe efter en refresh"
// (2026-07-06). Grundorsak: useAppState.ts:s selectedDashboardMemberId
// initierades alltid till null vid mount, trots att lastSelectedDashboardMemberId
// redan sparades korrekt på medlemmen vid varje val — bara aldrig återläst.
// activePanel återställdes redan korrekt till "home" via lastActivePanel, men
// utan barnet valt föll Hem-panelen tillbaka på den inloggade förälderns egen
// översikt istället för barnets dashboard.

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

// Simulerar en sidomladdning medan föräldern hade Nova:s dashboard öppen —
// lastActivePanel="home" + lastSelectedDashboardMemberId="mem-child" redan
// sparade sedan tidigare (precis som de skulle vara på riktigt efter ett
// tidigare besök, oavsett vad som händer i den här testkörningen).
const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
  lastActivePanel: "home", lastSelectedDashboardMemberId: "mem-child",
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

test("En sidomladdning medan förälderns tittar på ett barns dashboard stannar kvar där, går inte tillbaka till egna hem-vyn", async ({ page }) => {
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

  // page.goto("/") på en helt fräsch sida motsvarar en sidomladdning — appen
  // vet bara vad servern (mockad här) säger om senast valda panel/medlem.
  await page.goto("/");

  await expect(page.getByText(`Hej ${CHILD.name}!`)).toBeVisible();
  // "Familjens kalender" är MemberOverview.tsx:s egen hem-vy (visas annars
  // istället för barnets dashboard om valet inte återställdes efter refresh).
  await expect(page.getByText("Familjens kalender")).toHaveCount(0);
});
