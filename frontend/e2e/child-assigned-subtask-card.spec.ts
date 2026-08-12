import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-12, Zaidas önskemål: "delmoment man är signad på hamnar på
// dashboarden, gärna emojin vid start med" — samma funktion som
// adult-self-personal-dashboard.spec.ts redan testar för en vuxen, men här
// via ett RIKTIGT inloggat barn (ChildShellContent.tsx, en helt separat
// kod-/prop-väg från MemberShellContent.tsx som testar samma sak för en
// vuxens PersonalDashboard).

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

const USER = { id: "user-child", email: "nova@exempel.se", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };

const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: CHILD, account: ACCOUNT }],
};

// Rutinen (hela todon) tillhör en vuxen förälder, INTE Nova — bara ett
// enskilt delmoment är tilldelat Nova. Testar just detta: ett delmoment kan
// vara tilldelat en annan person än den todon i sig hör till
// (SubtaskAssigneeButton.tsx).
const EVENING_ROUTINE = {
  id: "todo-routine-1", accountId: "acc-1", title: "Kvällsrutin", createdBy: "mem-parent",
  assignedTo: "mem-parent", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Moon" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null,
  subtasks: [{ id: "sub-1", title: "🥪Ät kvällsfika", done: false, assignedTo: "mem-child" }]
};

test("barnet ser ett uppdragskort för ett delmoment tilldelat DEM, trots att hela rutinen tillhör en förälder", async ({ page }) => {
  let toggledSubtaskId: string | null = null;
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [EVENING_ROUTINE] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-routine-1/subtasks/sub-1", (route) => {
    toggledSubtaskId = "sub-1";
    return route.fulfill({ json: { done: true } });
  });

  await page.goto("/");

  // Hela rutinen är inte tilldelad Nova och ska inte synas som ett eget kort.
  await expect(page.getByText("Kvällsrutin")).toHaveCount(0);
  const subtaskCard = page.getByRole("button", { name: /Ät kvällsfika/ });
  await expect(subtaskCard).toBeVisible();
  await expect(subtaskCard.locator(".child-task-icon")).toHaveText("🥪");

  await subtaskCard.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  await expect.poll(() => toggledSubtaskId, { timeout: 3000 }).toBe("sub-1");
});
