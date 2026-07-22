import { test, expect } from "@playwright/test";

// Zaida (2026-07-22): "mallar till listor och undanlagda listor skall inte
// stå med i barnvyn ens för vuxna. endast assignade 2do" — den egna
// uppgifter+kalender-vyn (PersonalDashboard.tsx/ChildDashboard.tsx) ska bara
// visa RIKTIGT TILLDELADE, synliga uppgifter: inte otilldelade (assignedTo:
// null — "familjens gemensamma pool"), inte återkommande MALLAR, och inte
// uppgifter i en GÖMD kategori. De två första uteslöts redan av det
// befintliga filtret (assignedTo===id, recurrence==="none") — det gömda
// kategori-fallet var en riktig lucka, fixad i samma ändring.

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
  avatarUrl: null, color: null, dashboardTheme: "sunset",
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const VISIBLE_CATEGORY = { id: "cat-visible", accountId: "acc-1", memberId: "mem-1", name: "Vardag", createdAt: "2024-01-01T00:00:00.000Z", hidden: false, deletedAt: null, deletedBy: null };
const HIDDEN_CATEGORY = { id: "cat-hidden", accountId: "acc-1", memberId: "mem-1", name: "Packlista", createdAt: "2024-01-01T00:00:00.000Z", hidden: true, deletedAt: null, deletedBy: null };

function todo(overrides: Record<string, unknown>) {
  return {
    accountId: "acc-1", createdBy: "mem-1", isShared: false,
    status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "Star" },
    recurrence: { type: "none" }, recurringSourceId: null, occurrenceDate: null,
    completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null,
    ...overrides
  };
}

// OBS: en MALL (recurrence.type !== "none") testas medvetet inte här via en
// egen todo-rad — klienten genererar automatiskt dagens OCCURRENCE av en
// mall (recurringTodos.ts), med samma ärvda titel, vilket gör ett enkelt
// titel-baserat e2e-test opålitligt (occurrensen SKA visas, det är templaten
// SJÄLV, recurrence.type!=="none", som ska uteslutas — verifierat direkt i
// koden istället, se MemberShellContent.tsx/ChildShellContent.tsx).
const TODOS = [
  todo({ id: "todo-visible", title: "Handla mat", assignedTo: "mem-1", personalCategoryId: "cat-visible" }),
  todo({ id: "todo-unassigned", title: "Familjens gemensamma syssla", assignedTo: null }),
  todo({ id: "todo-hidden-category", title: "Packa resväska", assignedTo: "mem-1", personalCategoryId: "cat-hidden" }),
];

const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "fake-access-token", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

test("PersonalDashboard visar bara riktigt tilldelade, synliga uppgifter — inte otilldelade, mallar eller gömd kategori", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: TODOS }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [VISIBLE_CATEGORY, HIDDEN_CATEGORY] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/reward-shop**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased/, (route) => route.fulfill({ json: [] }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));

  await page.goto("/");
  await page.getByRole("button", { name: "Medlemmar" }).click();
  await page.getByRole("button", { name: /Testförälder/ }).click();

  await expect(page.getByText("Handla mat")).toBeVisible();
  await expect(page.getByText("Familjens gemensamma syssla")).toHaveCount(0);
  await expect(page.getByText("Packa resväska")).toHaveCount(0);
});
