import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-30, Zaidas önskemål: "du ska fortfarande kunna bli tilldelad
// todos i de familjer du är med i även om du valt att inte visa den
// familjen i familjevyn... dessa todos kommer till dina egna todos i
// herobaren". En avaktiverad familj (Member.hiddenCrossAccountIds) döljer
// dess delade "Familjen"-tråd helt ur Hem-vyn — men en todo personligt
// tilldelad MIG i den familjen (assignedTo===min egen medlemspost där)
// dyker ändå upp, fast i Todos-panelen (HeroBar → Todos) istället för i
// Hem-vyns familjetrådar. Se getCrossAccountFamilyTodos (todosService.ts)
// för backend-halvan (hidden:true-taggningen) och MemberShellContent.tsx
// för frontend-routingen.

const ACCOUNT = { id: "acc-a", name: "Familjen A", type: "family", createdBy: "mem-a", deletedAt: null };
const ROLE = {
  id: "role-1", name: "Förälder", isChildRole: false,
  permissions: {
    canManageMembers: true, canManageRoles: true, canSeeAllTodos: true, canSeeOwnTodos: true, canCreateTodos: true,
    canScheduleRecurringTodos: true, canCompleteAssignedTodos: true, canEditAnyTodos: true, canDeleteAnyTodos: true,
    canApproveTodos: true, canSeeAllCalendar: true, canSeeOwnCalendar: true, canCreateCalendar: true,
    canEditCalendar: true, canImportCalendar: true, canExportCalendar: true, canSeeShoppingLists: true,
    canCreateShoppingLists: true, canEditShoppingLists: true, canViewTrash: true, canRestoreFromTrash: true,
    canCreateChildAccounts: true, canManageChildTodos: true
  }
};
// Familjen B är avaktiverad i familjevyn (hiddenCrossAccountIds: ["acc-b"]).
const MEMBER_A = {
  id: "mem-a", accountId: "acc-a", userId: "user-1", name: "Förälder A", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null,
  hiddenCrossAccountIds: ["acc-b"]
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Förälder A", createdAt: "2024-01-01T00:00:00.000Z" };

// Personligt tilldelad till mig (mem-b, min egen medlemspost i Familjen B)
// — backend skulle för ett avaktiverat konto ALDRIG returnera en
// assignedTo:null-poolpost, bara denna typ av post, se getCrossAccountFamilyTodos.
const ASSIGNED_TODO_IN_HIDDEN_FAMILY = {
  id: "todo-b", accountId: "acc-b", title: "Diska i Familjen B", createdBy: "mem-b",
  assignedTo: "mem-b", status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null
};

test("Personligt tilldelad todo i en avaktiverad familj hamnar i mina egna todos, inte i Hem-vyns familjetrådar", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fake-access-token", user: USER, memberships: [{ member: MEMBER_A, account: ACCOUNT }] } })
  );
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER_A] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos/family-across-accounts", (route) =>
    route.fulfill({
      json: [{
        accountId: "acc-b",
        accountName: "Familjen B",
        myMemberId: "mem-b",
        todos: [ASSIGNED_TODO_IN_HIDDEN_FAMILY],
        categoryNames: {},
        hidden: true
      }]
    })
  );

  await page.goto("/");

  // Hem-vyns Todos-flik: ingen "Familjen B"-tråd — kontot är avaktiverat.
  await page.getByRole("tab", { name: "Visa todos" }).click();
  await expect(page.getByText("Diska i Familjen B")).not.toBeVisible();

  // Den vanliga Todos-panelen (HeroBar-navigeringen): todon syns här
  // istället, i en egen "Familjen (Familjen B)"-tråd.
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.getByText("Diska i Familjen B")).toBeVisible();
  await expect(page.getByText("Familjen (Familjen B)")).toBeVisible();
});
