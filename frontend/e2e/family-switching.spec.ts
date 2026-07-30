import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-07-29, Zaidas fynd: "när jag växlar i hemvyn till en annan familj så
// kommer jag inte tillbaka till min primära familj" — Shell (AppRouter.tsx)
// saknade en key på familjebyte, så activeAccount (useAccountState.ts) fröts
// permanent på den familj som var aktiv vid FÖRSTA mount. otherFamilies-
// filtret (useShellState.ts) jämförde mot detta frusna id, vilket gjorde att
// den ursprungliga familjen aldrig visades som en väljbar "annan familj" i
// dropdownen igen — man kunde alltså aldrig växla tillbaka.

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

const ACCOUNT_A = { id: "acc-a", name: "Familjen A", type: "family", createdBy: "mem-a", deletedAt: null };
const ACCOUNT_B = { id: "acc-b", name: "Familjen B", type: "family", createdBy: "mem-b", deletedAt: null };
const MEMBER_A = {
  id: "mem-a", accountId: "acc-a", userId: "user-1", name: "Förälder A", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null
};
const MEMBER_B = {
  id: "mem-b", accountId: "acc-b", userId: "user-1", name: "Förälder A", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Förälder A", createdAt: "2024-01-01T00:00:00.000Z", lastActiveMemberId: "mem-a" };

test("Familjeväxlaren i hemvyn: kan växla till en annan familj och sedan tillbaka igen", async ({ page }) => {
  let currentUser = { ...USER };

  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: currentUser,
        memberships: [{ member: MEMBER_A, account: ACCOUNT_A }, { member: MEMBER_B, account: ACCOUNT_B }]
      }
    })
  );
  await page.route("**/api/auth/preferences", (route) => {
    const body = route.request().postDataJSON() as { lastActiveMemberId: string };
    currentUser = { ...currentUser, lastActiveMemberId: body.lastActiveMemberId };
    return route.fulfill({ json: { user: currentUser } });
  });
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => {
    const memberId = route.request().headers()["x-member-id"];
    const accountMembers = memberId === "mem-b" ? [MEMBER_B] : [MEMBER_A];
    return route.fulfill({ json: accountMembers });
  });

  await page.goto("/");

  const familySelect = page.getByLabel("Familj");
  await expect(familySelect).toBeVisible();
  await expect(familySelect).toHaveValue("mem-a");
  await expect(page.getByRole("option", { name: "Familjen B" })).toHaveCount(1);

  await familySelect.selectOption({ label: "Familjen B" });
  await expect(familySelect).toHaveValue("mem-b");

  // Kärnan i buggen: Familjen A måste fortfarande gå att välja i dropdownen
  // efter att man lämnat den — innan fixen försvann den permanent.
  await expect(page.getByRole("option", { name: "Familjen A" })).toHaveCount(1);

  await familySelect.selectOption({ label: "Familjen A" });
  await expect(familySelect).toHaveValue("mem-a");
  await expect(page.getByRole("option", { name: "Familjen B" })).toHaveCount(1);
});

// 2026-07-30, Zaidas önskemål: "i hemmet skall du kunna växla mellan olika
// familjer och där skall gemensamma inköpslistor, todos, kalendrar,
// medlemmar visas" — Hem-panelen fick tre nya sammanfattningskort
// (Medlemmar/Uppgifter/Inköp) bredvid den redan befintliga kalendern. Testar
// samtidigt den relaterade cache-scopningsfixen (localCache.ts:s
// setCacheNamespace) — utan den skulle Familjen B:s Hem-vy kort visa
// Familjen A:s cachade uppgift/lista innan den färska hämtningen hann landa.
const TODO_A = {
  id: "todo-a", accountId: "acc-a", title: "Handla mjölk", createdBy: "mem-a",
  assignedTo: "mem-a", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null
};
const TODO_B = { ...TODO_A, id: "todo-b", accountId: "acc-b", title: "Klippa gräset", createdBy: "mem-b", assignedTo: "mem-b" };

const LIST_A = {
  id: "shop-a", accountId: "acc-a", name: "Veckohandling A", ownerId: "mem-a", color: "#2f7d6d", icon: null,
  sharedWith: [], deletedAt: null, deletedBy: null,
  items: [{ id: "item-a", title: "Mjölk", createdBy: "mem-a", done: false, deletedAt: null, deletedBy: null }]
};
const LIST_B = {
  id: "shop-b", accountId: "acc-b", name: "Veckohandling B", ownerId: "mem-b", color: "#2f7d6d", icon: null,
  sharedWith: [], deletedAt: null, deletedBy: null,
  items: [{ id: "item-b", title: "Bröd", createdBy: "mem-b", done: false, deletedAt: null, deletedBy: null }]
};

test("Hem visar rätt familjs uppgifter/inköpslistor/medlemmar efter ett familjebyte, ingen kvarbliven cache från föregående familj", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: USER,
        memberships: [{ member: MEMBER_A, account: ACCOUNT_A }, { member: MEMBER_B, account: ACCOUNT_B }]
      }
    })
  );
  await page.route("**/api/auth/preferences", (route) => route.fulfill({ json: { user: USER } }));
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => {
    const memberId = route.request().headers()["x-member-id"];
    return route.fulfill({ json: memberId === "mem-b" ? [MEMBER_B] : [MEMBER_A] });
  });
  await page.route("**/api/todos", (route) => {
    const memberId = route.request().headers()["x-member-id"];
    return route.fulfill({ json: memberId === "mem-b" ? [TODO_B] : [TODO_A] });
  });
  await page.route("**/api/shopping", (route) => {
    const memberId = route.request().headers()["x-member-id"];
    return route.fulfill({ json: memberId === "mem-b" ? [LIST_B] : [LIST_A] });
  });

  await page.goto("/");

  await expect(page.getByText("Handla mjölk")).toBeVisible();
  await expect(page.getByText("Veckohandling A")).toBeVisible();
  await expect(page.getByText("Klippa gräset")).not.toBeVisible();

  const familySelect = page.getByLabel("Familj");
  await familySelect.selectOption({ label: "Familjen B" });

  await expect(page.getByText("Klippa gräset")).toBeVisible();
  await expect(page.getByText("Veckohandling B")).toBeVisible();
  // Ingen kvarbliven cache från Familjen A — den gamla uppgiften/listan
  // ska inte synas efter bytet, ens innan den färska hämtningen landar.
  await expect(page.getByText("Handla mjölk")).not.toBeVisible();
  await expect(page.getByText("Veckohandling A")).not.toBeVisible();
});
