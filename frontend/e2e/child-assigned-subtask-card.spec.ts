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

// 2026-08-13, Zaidas fråga: "har deluppgifterna fått huvuduppgiftens
// sluttid?" — delmomentet ärver förälder-todons visibleFrom/expiresAt och
// blandas nu in i SAMMA sluttids-sorterade lista som de vanliga korten
// (compareTodosByEndThenStart, todos/selectors.ts), inte längre en egen
// osorterad klump sist.
const now = Date.now();

const OWN_TODO_LATE_END = {
  id: "todo-own-1", accountId: "acc-1", title: "Duscha", createdBy: "mem-parent",
  assignedTo: "mem-child", isShared: false, status: "pending", starValue: 1,
  visual: { type: "lucide-icon", value: "Droplet" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: new Date(now + 3 * 3600_000).toISOString(),
  deletedAt: null, deletedBy: null, personalCategoryId: null, notes: null, subtasks: []
};

const ROUTINE_EARLY_END = {
  id: "todo-routine-2", accountId: "acc-1", title: "Morgonrutin", createdBy: "mem-parent",
  assignedTo: "mem-parent", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Sun" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: new Date(now + 1 * 3600_000).toISOString(),
  deletedAt: null, deletedBy: null, personalCategoryId: null, notes: null,
  subtasks: [{ id: "sub-2", title: "🪥Borsta tänderna", done: false, assignedTo: "mem-child" }]
};

test("delmoment-kort med tidigare ärvd sluttid hamnar FÖRE ett vanligt kort med senare sluttid", async ({ page }) => {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [OWN_TODO_LATE_END, ROUTINE_EARLY_END] });
    return route.fulfill({ json: {} });
  });

  await page.goto("/");

  const cards = page.locator(".child-tasks-grid > *");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Borsta tänderna");
  await expect(cards.nth(1)).toContainText("Duscha");
});

// 2026-08-16, Zaidas fynd: "vi behöver mer kontrast på delmomenten i
// dashboarden. Delmomenten kan ha vit text om bakgrunden är mörk så att den
// syns, och en vit ram om bakgrunden är mörk. Är den ljus så ska det vara
// svart istället" — ett delmoment har inget eget kategori-fält och fick
// därför ALDRIG --task-accent/--task-bg satt (till skillnad från vanliga
// uppdragskort, se getTaskStyle/KNOWN_CATEGORIES i ChildTasksSection.tsx),
// vilket gjorde både .child-task-card:s bakgrund- OCH border-deklaration
// ogiltig CSS (faller tyst bort) — kortet syntes då direkt mot
// .child-dashboard.css:s egen flerfärgade gradient med en ALLTID svart text
// (hårdkodad --black), osynlig mot ett mörkt barntema. Fixat med --on-c4
// (samma redan handplockade, per-barntema kontrasttoken som resten av
// dashboarden använder) för både text och kant — kräver en egen override i
// themes.css (.child-dashboard[class*="theme-"] .child-task-card--subtask)
// eftersom barntema-systemets EGEN, mer specifika regel för
// .child-task-card annars vinner och tvingar tillbaka svart text/kant
// oavsett tema.
test("delmoment-kortets text/kant får rätt kontrast mot både ett mörkt och ett ljust barntema", async ({ page }) => {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [EVENING_ROUTINE] });
    return route.fulfill({ json: {} });
  });

  // Standardtemat ("Rymden", när dashboardTheme är null) är mörkt — se
  // ChildDashboard.tsx:s fallback ?? "space".
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.goto("/");
  const darkCard = page.locator(".child-task-card--subtask");
  await expect(darkCard).toBeVisible();
  await expect(darkCard).toHaveCSS("border-color", "rgb(255, 255, 255)");
  await expect(darkCard.locator(".child-task-name")).toHaveCSS("color", "rgb(255, 255, 255)");

  // "Regnbågen ljus" är det enda barntemat med --on-c4: svart, se themes.css.
  await page.route("**/api/members", (route) => route.fulfill({ json: [{ ...CHILD, dashboardTheme: "rainbow-light" }] }));
  await page.goto("/");
  const lightCard = page.locator(".child-task-card--subtask");
  await expect(lightCard).toBeVisible();
  await expect(lightCard).toHaveCSS("border-color", "rgb(0, 0, 0)");
  await expect(lightCard.locator(".child-task-name")).toHaveCSS("color", "rgb(0, 0, 0)");
});
