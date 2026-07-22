import { test, expect } from "@playwright/test";

// ADR-0025 (2026-07-23, Zaidas beslut): "Töm papperskorgen permanent" — ett
// medvetet undantag från appens "aldrig hard delete"-regel. Testar att
// knappen kräver dubbel bekräftelse, anropar alla fyra purge-trash-
// endpointerna, och att raderade-rader-listan töms i UI:t efteråt.

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
const DELETED_MEMBER = {
  id: "mem-2", accountId: "acc-1", userId: null,
  name: "Raderad medlem", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: "2026-07-01T00:00:00.000Z", deletedBy: "mem-1",
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "tok", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

const DELETED_LIST = {
  id: "list-1", accountId: "acc-1", ownerId: "mem-1", name: "Raderad lista",
  color: "#2f7d6d", icon: null, sharedWith: [], deletedAt: "2026-07-01T00:00:00.000Z", deletedBy: "mem-1", items: []
};
const DELETED_CALENDAR = {
  id: "cal-1", accountId: "acc-1", ownerId: "mem-1", name: "Raderad kalender", color: "#5588cc",
  sharedWith: [], deletedAt: "2026-07-01T00:00:00.000Z", deletedBy: "mem-1", keepAllHistory: false, events: [],
  subscriptions: []
};
const DELETED_TODO = {
  id: "todo-1", accountId: "acc-1", title: "Raderad todo", createdBy: "mem-1", assignedTo: "mem-1",
  isShared: false, status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "Star" },
  recurrence: { type: "none" }, visibleFrom: null, expiresAt: null, completedAt: null, approvedBy: null,
  approvedAt: null, rejectedBy: null, rejectedAt: null, deletedAt: "2026-07-01T00:00:00.000Z", deletedBy: "mem-1"
};

test("Töm papperskorgen permanent: dubbel bekräftelse, anropar alla fyra endpoints, tömmer listan", async ({ page }) => {
  const purgeCalls: string[] = [];

  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, DELETED_MEMBER] }));
  await page.route("**/api/members/purge-trash", (route) => {
    purgeCalls.push("members");
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [DELETED_TODO] });
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/todos/purge-trash", (route) => {
    purgeCalls.push("todos");
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [DELETED_CALENDAR] });
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/calendars/purge-trash", (route) => {
    purgeCalls.push("calendars");
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/shopping", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [DELETED_LIST] });
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/shopping/purge-trash", (route) => {
    purgeCalls.push("shopping");
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/reward-shop**", (route) => route.fulfill({ json: { items: [], requireApprovalForCategories: false } }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/todo-templates/**", (route) => route.fulfill({ json: [] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Konto & familj" }).click();
  await page.getByRole("button", { name: "Papperskorg" }).click();

  await expect(page.getByText("Raderad medlem")).toBeVisible();
  await expect(page.getByText("Raderad lista")).toBeVisible();
  await expect(page.getByText("Raderad kalender")).toBeVisible();
  await expect(page.getByText("Raderad todo")).toBeVisible();

  const purgeButton = page.getByRole("button", { name: "Töm papperskorgen permanent" });
  await purgeButton.click();

  // Första klicket bara bekräftar — inget anrop ännu.
  expect(purgeCalls).toHaveLength(0);
  await expect(page.getByRole("button", { name: /Bekräfta/ })).toBeVisible();

  await page.getByRole("button", { name: /Bekräfta/ }).click();

  await expect(page.getByText("Papperskorgen är tom.")).toBeVisible();
  expect(purgeCalls.sort()).toEqual(["calendars", "members", "shopping", "todos"]);
});
