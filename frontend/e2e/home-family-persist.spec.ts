import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-07-31, Zaidas uppföljning: "dessutom verkar alla familjer vara
// inställt på default, helt ok, men jag vill att den sparar det jag senast
// valde" — valet i Hem-vyns "Familj"-väljare sparas nu server-side
// (Member.homeSelectedFamilyId) och läses tillbaka vid nästa sidladdning,
// istället för att alltid återgå till "Alla familjer".

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
let MEMBER_A = {
  id: "mem-a", accountId: "acc-a", userId: "user-1", name: "Förälder A", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null,
  homeSelectedFamilyId: null as string | null
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Förälder A", createdAt: "2024-01-01T00:00:00.000Z" };

test("Hem-vyns familjefilter sparar senast valda familj och läser tillbaka den vid nästa sidladdning", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fake-access-token", user: USER, memberships: [{ member: MEMBER_A, account: ACCOUNT }] } })
  );
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER_A] }));
  await page.route("**/api/members/*", (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Partial<typeof MEMBER_A>;
      MEMBER_A = { ...MEMBER_A, ...body };
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/todos/family-across-accounts", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", todos: [] }] })
  );

  await page.goto("/");
  const familyFilter = page.getByLabel("Familj");
  await expect(familyFilter).toBeVisible();
  await expect(familyFilter).toHaveValue("all");

  // updateMemberNavigation (useMembersState.ts) är avsiktligt fire-and-forget
  // — vänta in PATCH-anropet explicit innan sidomladdningen, annars kan
  // reload hinna före att MEMBER_A faktiskt uppdaterats i mock-servern.
  const patchDone = page.waitForResponse((res) => res.url().includes("/api/members/mem-a") && res.request().method() === "PATCH");
  await familyFilter.selectOption({ label: "Familjen B" });
  await expect(familyFilter).toHaveValue("acc-b");
  await patchDone;

  // En sidomladdning läser nu tillbaka senast valda familj från servern
  // (MEMBER_A.homeSelectedFamilyId sattes av PATCH-anropet ovan) istället
  // för att återgå till "Alla familjer".
  await page.reload();
  await expect(page.getByLabel("Familj")).toHaveValue("acc-b");
});
