import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-07-31, Zaidas önskemål: "nu kan jag aktivera kalendrar från olika
// familjer i min hem-vy, men om jag väljer en familj, då vill jag att
// endast den familjens kalenderhändelser, todos och medlemmar visas, men
// möjlighet att välja samtliga familjer så att allt visas i hemvyn" — ett
// nytt "Visa familj"-filter ovanför Hem-översikten, bara synligt när minst
// två familjer bidrar med data (egen + minst en delad/ansluten källa).

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
  assignedTo: "mem-a", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null
};
const TODO_B = { ...TODO_A, id: "todo-b", accountId: "acc-b", title: "Klippa gräset", createdBy: "mem-b", assignedTo: null };

test("Hem-vyns familjefilter: Alla familjer visar allt, ett val visar bara den familjens uppgifter/medlemmar", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fake-access-token", user: USER, memberships: [{ member: MEMBER_A, account: ACCOUNT }] } })
  );
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER_A] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO_A] }));

  // "Mina familjekonton" bidrar med en todo-tråd + medlem från Familjen B —
  // ren cross-account-data (samma person, flera egna medlemskap).
  await page.route("**/api/todos/family-across-accounts", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", todos: [TODO_B] }] })
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

  // Medlemmar OCH familjeväljaren ligger sedan 2026-08-12 i en gemensam,
  // riktig "Medlemmar"-flik (MemberOverview.tsx, Zaidas beslut: "ta bort
  // drop down och gå tillbaka till en sida man kommer till") — ersätter de
  // tidigare två separata ikon+popup-mönstren. Att kolla medlemmar/familjer
  // innebär nu ett riktigt flikbyte, inte en overlay ovanpå Todos-fliken —
  // helpers-funktionerna växlar därför alltid tillbaka till "Visa todos"
  // efteråt så resten av testflödet är opåverkat.
  const membersTab = page.getByRole("tab", { name: "Visa medlemmar" });
  const todosTab = page.getByRole("tab", { name: "Visa todos" });
  const membersList = page.getByLabel("Medlemslista");
  const familyGroup = page.getByLabel("Familjeval");
  async function expectMemberVisible(name: string) {
    await membersTab.click();
    await expect(membersList.getByText(name)).toBeVisible();
    await todosTab.click();
  }
  async function expectMemberHidden(name: string) {
    await membersTab.click();
    await expect(membersList.getByText(name)).not.toBeVisible();
    await todosTab.click();
  }
  async function selectFamily(label: string) {
    await membersTab.click();
    await familyGroup.getByRole("button", { name: label }).click();
    await todosTab.click();
  }

  // Todos ligger bakom en flik (2026-07-31) — inte synligt förrän man
  // klickar ikonen bredvid familjeväljaren.
  await todosTab.click();

  await expect(page.getByText("Handla mjölk")).toBeVisible();
  await expect(page.getByText("Klippa gräset")).toBeVisible();
  await expectMemberVisible("Förälder A");
  await expectMemberVisible("Nova");

  await membersTab.click();
  await expect(familyGroup.getByText("Alla familjer")).toBeVisible();
  await expect(familyGroup.getByText("Familjen A")).toBeVisible();
  await expect(familyGroup.getByText("Familjen B")).toBeVisible();
  await todosTab.click();

  // Bara Familjen B — Familjen A:s uppgift/medlem försvinner, Familjen B:s
  // egna finns kvar.
  await selectFamily("Familjen B");
  await expect(page.getByText("Klippa gräset")).toBeVisible();
  await expectMemberVisible("Nova");
  await expect(page.getByText("Handla mjölk")).not.toBeVisible();
  await expectMemberHidden("Förälder A");

  // Bara Familjen A (mitt eget konto) — omvänt.
  await selectFamily("Familjen A");
  await expect(page.getByText("Handla mjölk")).toBeVisible();
  await expectMemberVisible("Förälder A");
  await expect(page.getByText("Klippa gräset")).not.toBeVisible();
  await expectMemberHidden("Nova");

  // Tillbaka till Alla familjer — allt syns igen.
  await selectFamily("Alla familjer");
  await expect(page.getByText("Handla mjölk")).toBeVisible();
  await expect(page.getByText("Klippa gräset")).toBeVisible();
});

test("Hem-vyns familjefilter döljs helt när bara en familj bidrar med data", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fake-access-token", user: USER, memberships: [{ member: MEMBER_A, account: ACCOUNT }] } })
  );
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER_A] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO_A] }));

  await page.goto("/");

  await page.getByRole("tab", { name: "Visa todos" }).click();
  await expect(page.getByText("Handla mjölk")).toBeVisible();
  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await expect(page.getByLabel("Familjeval")).toHaveCount(0);
});
