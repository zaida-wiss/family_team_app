import { test, expect, type Page } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Zaida rapporterade 2026-07-04 (skärmdump): "duplicerade" todo-symboler i barnets
// tidslinje. Grundorsak: ChildTimeline.tsx:s completedTodos-filter saknade
// assignedTo === child.id, till skillnad från upcomingTodoMarkers som redan
// filtrerade rätt — varje barns egen tidslinje visade ALLA familjemedlemmars
// avklarade uppgifter den dagen, inte bara barnets egna. Om två syskon båda
// avklarade en likadan rutin (t.ex. borsta tänderna) samma dag såg det ut som
// dubbletter på vardera barnets tidslinje.

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
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};

const SIBLING = {
  id: "mem-sibling", accountId: "acc-1", userId: null,
  name: "Leo", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};

const USER = { id: "user-child", email: "nova@exempel.se", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };

const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: CHILD, account: ACCOUNT }],
};

const now = new Date().toISOString();

const OWN_TODO = {
  id: "todo-own", accountId: "acc-1", title: "Egen uppgift", createdBy: "mem-parent",
  assignedTo: "mem-child", isShared: false, status: "done", starValue: 2,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, visibleFrom: null, expiresAt: null,
  completedAt: now, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, deletedAt: null, deletedBy: null,
};

const SIBLING_TODO = {
  ...OWN_TODO,
  id: "todo-sibling",
  title: "Syskonets uppgift",
  assignedTo: "mem-sibling",
};

// 2026-08-10: mockDataAPIs() (helpers.ts) registreras FÖRST — se
// todo-timer.spec.ts:s identiska kommentar (samma bugklass).
async function mockChildSession(page: Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD, SIBLING] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [OWN_TODO, SIBLING_TODO] }));
}

test("Barnets tidslinje visar bara sina egna avklarade uppgifter, inte syskons", async ({ page }) => {
  await mockChildSession(page);

  await page.goto("/");

  const donePins = page.locator(".child-tl-reward-pin--done");
  await expect(donePins).toHaveCount(1);
  await expect(page.locator(".child-tl-reward-pin--done[title='Egen uppgift']")).toBeVisible();
  await expect(page.locator(".child-tl-reward-pin--done[title='Syskonets uppgift']")).toHaveCount(0);
});
