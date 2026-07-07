import { test, expect, type Page } from "@playwright/test";

// Todo-timerfunktion (2026-07-07, Zaidas önskemål: "precis som barnens
// belöningar skall man även kunna lägga in en timer på hur lång aktiviteten
// är") — separat, enklare system än TimedTask/Medaljer-Rekord (ingen
// personbästa, bara en inspelad tid för just detta tillfälle). Mönstret
// speglar timed-task-record.spec.ts.

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

const now = new Date();
const todayStart = new Date(now);
todayStart.setHours(0, 0, 0, 0);
const todayEnd = new Date(now);
todayEnd.setHours(23, 59, 59, 999);

const TIMER_TODO = {
  id: "todo-timer-1",
  accountId: "acc-1",
  title: "Städa rummet",
  createdBy: "mem-parent",
  assignedTo: "mem-child",
  isShared: false,
  status: "pending",
  starValue: 3,
  visual: { type: "lucide-icon", value: "🧹" },
  recurrence: { type: "none" },
  recurringSourceId: null,
  occurrenceDate: null,
  visibleFrom: todayStart.toISOString(),
  expiresAt: todayEnd.toISOString(),
  completedAt: null,
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectedReason: null,
  deletedAt: null,
  deletedBy: null,
  timerEnabled: true,
  elapsedMs: null,
};

// Nedräkningsläget (2026-07-07, Zaidas förtydligande: "jag menar en timer,
// där bordet visar hur lång tid som är kvar efter att man tryckt på knappen
// med dubbelklick. Sedan markerar man den som klar med två sekunderstryck.")
// — plannedDurationMinutes satt gör att kortet räknar NER istället för upp,
// och avslutas med samma 2s-håll som en vanlig uppgift, inte en Klar-knapp.
const COUNTDOWN_TODO = {
  ...TIMER_TODO,
  id: "todo-timer-2",
  title: "Plocka undan leksaker",
  plannedDurationMinutes: 1
};

async function mockChildSession(page: Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
}

test("Barnets uppgifter: en tidtagen uppgift har Starta/Klar-knapp istället för håll-in", async ({ page }) => {
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TIMER_TODO] }));

  await page.goto("/");
  await expect(page.getByText("Städa rummet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Starta Städa rummet" })).toBeVisible();
});

test("Barnets uppgifter: start/stopp på en tidtagen uppgift skickar elapsedMs till /complete", async ({ page }) => {
  let sentElapsedMs: number | null | undefined;
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TIMER_TODO] }));
  await page.route("**/api/todos/todo-timer-1/complete", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { elapsedMs: number | null };
    sentElapsedMs = body.elapsedMs;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Starta Städa rummet" }).click();
  await expect(page.getByRole("button", { name: "Klar med Städa rummet" })).toBeVisible();

  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Klar med Städa rummet" }).click();

  await expect.poll(() => sentElapsedMs).not.toBeUndefined();
  expect(sentElapsedMs).not.toBeNull();
  expect(sentElapsedMs as number).toBeGreaterThan(500);
  expect(sentElapsedMs as number).toBeLessThan(5000);
});

test("Barnets uppgifter: begär skärm-wake-lock medan en todo-timer pågår, släpper vid Klar", async ({ page }) => {
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TIMER_TODO] }));
  await page.route("**/api/todos/todo-timer-1/complete", (route) => route.fulfill({ json: { ok: true } }));

  await page.addInitScript(() => {
    (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls = [];
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async (type: string) => {
          (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls.push(`request:${type}`);
          return {
            released: false,
            release: async () => {
              (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls.push("release");
            },
          };
        },
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Starta Städa rummet" }).click();

  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls)
  ).toEqual(["request:screen"]);

  await page.getByRole("button", { name: "Klar med Städa rummet" }).click();

  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls)
  ).toContain("release");
});

test("Barnets uppgifter: en tidtagen uppgift med planerad tid visar nedräkning, dubbelklick startar, 2s-håll avslutar", async ({ page }) => {
  let sentElapsedMs: number | null | undefined;
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [COUNTDOWN_TODO] }));
  await page.route("**/api/todos/todo-timer-2/complete", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { elapsedMs: number | null };
    sentElapsedMs = body.elapsedMs;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  const card = page.getByRole("button", { name: /Plocka undan leksaker/ });
  await expect(card).toBeVisible();
  // Innan start: ingen Starta/Klar-knapp — hela kortet är dubbelklicksytan.
  await expect(page.getByRole("button", { name: "Starta Plocka undan leksaker" })).toHaveCount(0);

  await card.dblclick();
  await expect(page.getByText(/0:5\d kvar|1:00 kvar/)).toBeVisible();

  // Simulerar ett 2+ sekunders håll, samma dispatchEvent-mönster som det
  // befintliga långtryck-testet i parent-todo-thread-view.spec.ts (undviker
  // page.mouse:s känslighet för layoutskift under väntan).
  await card.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  await expect.poll(() => sentElapsedMs, { timeout: 3000 }).not.toBeUndefined();
  expect(sentElapsedMs).not.toBeNull();
  expect(sentElapsedMs as number).toBeGreaterThan(1800);
});
