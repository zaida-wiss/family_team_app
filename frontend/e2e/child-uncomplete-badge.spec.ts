import { test, expect, type Page } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Ångra klarmarkering (2026-08-10, förenklat samma dag — se
// ChildPendingBadges.tsx: håll-in+dra-uppåt visade sig otillförlitligt,
// Zaidas fynd: "det räcker att hålla in ikonen 2 sekunder så skall den hoppa
// tillbaka") — samma raka håll-in-2-sekunder-gest som uppdragskortens egen
// klarmarkeringsgest, på den lilla snurrande "väntar på godkännande"-badgen.
// Kortet ska bara komma tillbaka om det fortfarande finns tid att utföra
// uppgiften på (visibleFrom/expiresAt).

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
const LOGIN_RESPONSE = { accessToken: "fake-access-token", user: USER, memberships: [{ member: CHILD, account: ACCOUNT }] };

function doneTodo(overrides: Record<string, unknown>) {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  return {
    id: "todo-done-1",
    accountId: "acc-1",
    title: "Duka bordet",
    createdBy: "mem-parent",
    assignedTo: "mem-child",
    isShared: false,
    status: "done",
    starValue: 2,
    visual: { type: "lucide-icon", value: "🍽️" },
    recurrence: { type: "none" },
    recurringSourceId: null,
    occurrenceDate: null,
    visibleFrom: start.toISOString(),
    expiresAt: end.toISOString(),
    completedAt: now.toISOString(),
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

// 2026-08-10: mockDataAPIs() (helpers.ts) registreras FÖRST — se
// todo-timer.spec.ts:s identiska kommentar (samma bugklass, en till synes
// "flakig" körning visade sig vara inloggningssidan p.g.a. ett riktigt,
// ej mockat nätverksanrop som gav ett äkta 401).
async function mockChildSession(page: Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
}

async function getBadge(page: Page) {
  const badge = page.getByRole("button", { name: /väntar på godkännande/ });
  await expect(badge).toBeVisible({ timeout: 15000 });
  return badge;
}

test("håll intryckt i 2s på badgen ångrar klarmarkeringen, uppdragskortet kommer tillbaka", async ({ page }) => {
  let uncompleteCalled = false;
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [doneTodo({})] }));
  await page.route("**/api/todos/todo-done-1/uncomplete", (route) => {
    uncompleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  const badge = await getBadge(page);
  // Scopat till uppgiftslistan, inte hela sidan — badgens EGEN aria-label
  // ("Duka bordet, väntar på godkännande...") matchar annars också
  // /Duka bordet/ (regex utan ankare = substrängsmatchning), så en global
  // page-sökning kan aldrig bli 0 medan badgen finns kvar. Listan (och dess
  // <section aria-label="Uppgifter idag">) renderas inte alls när todos är
  // tomt, se ChildTasksSection.tsx — resolvear korrekt till 0 element.
  await expect(
    page.getByRole("region", { name: "Uppgifter idag" }).getByRole("button", { name: /Duka bordet/ })
  ).toHaveCount(0);

  await badge.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  // Håll-tiden är deterministiskt 2000ms (UNDO_HOLD_DURATION_MS) — pollfönstret
  // ger utrymme för nätverksmocken/CI-belastning ovanpå det, inte bara en snäv
  // marginal (samma resonemang som getBadge:s egna generösa timeout ovan).
  await expect.poll(() => uncompleteCalled, { timeout: 8000 }).toBe(true);

  await expect(page.getByRole("button", { name: /väntar på godkännande/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Duka bordet/ })).toBeVisible();
});

test("släpper man innan 2s har gått ångras ingenting", async ({ page }) => {
  let uncompleteCalled = false;
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [doneTodo({})] }));
  await page.route("**/api/todos/todo-done-1/uncomplete", (route) => {
    uncompleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  const badge = await getBadge(page);
  await badge.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  await page.waitForTimeout(800);
  await badge.dispatchEvent("pointerup", { pointerId: 1, button: 0 });
  await page.waitForTimeout(1500);

  expect(uncompleteCalled).toBe(false);
  await expect(badge).toBeVisible();
});

test("ångrar man en uppgift vars tidsfönster redan gått ut kommer kortet inte tillbaka", async ({ page }) => {
  let uncompleteCalled = false;
  await mockChildSession(page);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const start = new Date(yesterday); start.setHours(0, 0, 0, 0);
  const end = new Date(yesterday); end.setHours(23, 59, 59, 999);
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: [doneTodo({ visibleFrom: start.toISOString(), expiresAt: end.toISOString() })] })
  );
  await page.route("**/api/todos/todo-done-1/uncomplete", (route) => {
    uncompleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  const badge = await getBadge(page);
  await badge.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  await expect.poll(() => uncompleteCalled, { timeout: 8000 }).toBe(true);

  await expect(page.getByRole("button", { name: /väntar på godkännande/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Duka bordet/ })).toHaveCount(0);
});
