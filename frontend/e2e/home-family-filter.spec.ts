import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-30, Zaidas önskemål: "Välj familj på dashboarden skall flyttas
// till familj, där jag ska kunna välja vilka familjeanslutningar som skall
// visas i familjevyn" — den tidigare "Visa familj"-väljaren (filtrera Hem-
// vyn till EN familj i taget, se historiken 2026-07-31) är helt borttagen.
// Hem-vyns familjevy visar numera alltid ALLA icke-avaktiverade familjer
// kombinerat — vilka familjer som bidrar styrs istället i Inställningar →
// Familj → Familjevy (se family-view-settings.spec.ts för den mekaniken).

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
const MEMBER_A = {
  id: "mem-a", accountId: "acc-a", userId: "user-1", name: "Förälder A", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Förälder A", createdAt: "2024-01-01T00:00:00.000Z" };

const TODO_A = {
  id: "todo-a", accountId: "acc-a", title: "Handla mjölk", createdBy: "mem-a",
  assignedTo: "mem-a", status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null
};
const TODO_B = { ...TODO_A, id: "todo-b", accountId: "acc-b", title: "Klippa gräset", createdBy: "mem-b", assignedTo: null };

test("Hem-vyns familjevy visar alla bidragande familjers uppgifter och medlemmar kombinerat, ingen väljare kvar", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fake-access-token", user: USER, memberships: [{ member: MEMBER_A, account: ACCOUNT }] } })
  );
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER_A] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO_A] }));

  // "Mina familjekonton" bidrar med en todo-tråd + medlem från Familjen B —
  // ren cross-account-data (samma person, flera egna medlemskap), ingen av
  // dem avaktiverad (hidden:false).
  await page.route("**/api/todos/family-across-accounts", (route) =>
    route.fulfill({
      json: [{ accountId: "acc-b", accountName: "Familjen B", myMemberId: "mem-b", todos: [TODO_B], categoryNames: {}, hidden: false }]
    })
  );
  await page.route("**/api/members/cross-account", (route) =>
    route.fulfill({
      json: [{
        accountId: "acc-b", accountName: "Familjen B",
        members: [{ id: "mem-b-child", name: "Nova", avatarUrl: null, color: null, isChild: true }]
      }]
    })
  );

  await page.goto("/");

  // Medlemmar ligger i Hem-panelens standardvy (MemberOverview.tsx,
  // Zaidas beslut 2026-08-29 efter en mockup-bild) — ett klick på Hem
  // (HeroBar) landar alltid där, oavsett aktiv Hem-flik.
  const homeButton = page.getByRole("button", { name: "Hem", exact: true });
  const todosTab = page.getByRole("tab", { name: "Visa todos" });
  const membersList = page.getByLabel("Medlemslista");

  await todosTab.click();
  await expect(page.getByText("Handla mjölk")).toBeVisible();
  await expect(page.getByText("Klippa gräset")).toBeVisible();

  await homeButton.click();
  await expect(membersList.getByText("Förälder A")).toBeVisible();
  await expect(membersList.getByText("Nova")).toBeVisible();

  // Den gamla "Visa familj"-väljaren finns inte längre, oavsett hur många
  // familjer som bidrar.
  await expect(page.getByLabel("Familjeval")).toHaveCount(0);
});
