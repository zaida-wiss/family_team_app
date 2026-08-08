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

// 2026-08-09: den gamla Starta/Klar-knappen för en uppgift UTAN planerad tid
// (öppen tidtagning, räknar uppåt) togs bort — Zaidas fynd: "en gammal
// knapp för att starta timer har kommit tillbaka... uppgiften får inte
// markeras som klar av att man stoppar timern." Samma gest som
// nedräkningsläget nu: tre snabba tryck startar, 2s-håll avslutar (INTE en
// knapp vars klick både stoppade OCH markerade klar samtidigt).
test("Barnets uppgifter: en tidtagen uppgift utan planerad tid startas med tre snabba tryck, ingen Starta/Klar-knapp", async ({ page }) => {
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TIMER_TODO] }));

  await page.goto("/");
  const card = page.getByRole("button", { name: /Städa rummet/ });
  await expect(card).toBeVisible();
  await expect(page.getByRole("button", { name: "Starta Städa rummet" })).toHaveCount(0);

  await card.click({ clickCount: 3 });
  await expect(page.getByText(/^\d:\d\d$/)).toBeVisible();
});

test("Barnets uppgifter: tre tryck + 2s-håll på en öppen tidtagning skickar elapsedMs till /complete", async ({ page }) => {
  let sentElapsedMs: number | null | undefined;
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TIMER_TODO] }));
  await page.route("**/api/todos/todo-timer-1/complete", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { elapsedMs: number | null };
    sentElapsedMs = body.elapsedMs;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  const card = page.getByRole("button", { name: /Städa rummet/ });
  await card.click({ clickCount: 3 });
  await expect(page.getByText(/^\d:\d\d$/)).toBeVisible();

  await page.waitForTimeout(1200);
  // Samma dispatchEvent-mönster som nedräkningstestet nedan — simulerar ett
  // 2+ sekunders håll utan page.mouse:s känslighet för layoutskift.
  await card.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  await expect.poll(() => sentElapsedMs, { timeout: 3000 }).not.toBeUndefined();
  expect(sentElapsedMs).not.toBeNull();
  expect(sentElapsedMs as number).toBeGreaterThan(1000);
  expect(sentElapsedMs as number).toBeLessThan(6000);
});

test("Barnets uppgifter: begär skärm-wake-lock medan en öppen tidtagning pågår, släpper vid 2s-håll", async ({ page }) => {
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
  const card = page.getByRole("button", { name: /Städa rummet/ });
  await card.click({ clickCount: 3 });

  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls)
  ).toEqual(["request:screen"]);

  await card.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });

  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls),
    { timeout: 3000 }
  ).toContain("release");
});

// 2026-08-08: tre snabba tryck startar (var dubbelklick) — samma gest som
// vuxenvyns bubblor (Zaidas önskemål: "tidtagning skall starta om man
// trycker 3 snabba tryck på uppgiften i både barnvy och vuxenvy"). Den
// löpande tiden visas nu som en digital sifferbadge längst ner till höger
// (ingen "kvar"-text i själva badgen — aria-label på kortet bär fortsatt
// den fullständiga, tillgängliga beskrivningen).
test("Barnets uppgifter: en tidtagen uppgift med planerad tid visar nedräkning, tre snabba tryck startar, 2s-håll avslutar", async ({ page }) => {
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
  // Innan start: ingen Starta/Klar-knapp — hela kortet är tryckytan.
  await expect(page.getByRole("button", { name: "Starta Plocka undan leksaker" })).toHaveCount(0);

  await card.click({ clickCount: 3 });
  await expect(card).toHaveAccessibleName(/0:5\d kvar|1:00 kvar/);
  await expect(page.getByText(/^0:5\d$|^1:00$/)).toBeVisible();

  // Simulerar ett 2+ sekunders håll, samma dispatchEvent-mönster som det
  // befintliga långtryck-testet i parent-todo-thread-view.spec.ts (undviker
  // page.mouse:s känslighet för layoutskift under väntan).
  await card.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  await expect.poll(() => sentElapsedMs, { timeout: 3000 }).not.toBeUndefined();
  expect(sentElapsedMs).not.toBeNull();
  expect(sentElapsedMs as number).toBeGreaterThan(1800);
});

// 2026-08-08, Zaidas fynd + två rättelser samma dag: "om man trycker på
// uppdragskortet i barnvyn 3 ggr när timern redan är igång nollställs den",
// följt av "man skall alltså kunna trycka 3 snabba tryck om man behövde
// starta om timern", och slutligen förtydligat: "när jag menar 'nollställ'
// så menar jag så som det var i inställningarna innan man tryckte. Var det
// en timer på 2 minuter så skall en nollställning föra så att den går
// tillbaka till just 2 min. Är det en tidtagning så skall den börja om från
// 0." — INGEN toggle, en ren nollställning som håller timern IGÅNG.
// Verifierar: start → låt den gå en bit → tre nya tryck → tillbaka till
// hela den planerade tiden (1:00), fortsatt räknande (inte stoppad).
test("Barnets uppgifter: tre nya tryck medan timern går nollställer den till full planerad tid, fortsätter räkna", async ({ page }) => {
  await mockChildSession(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [COUNTDOWN_TODO] }));

  await page.goto("/");
  const card = page.getByRole("button", { name: /Plocka undan leksaker/ });
  await expect(card).toBeVisible();

  await card.click({ clickCount: 3 });
  await expect(card).toHaveAccessibleName(/0:5\d kvar|1:00 kvar/);

  // Låt nedräkningen hinna gå en bit, så en efterföljande nollställning
  // (tillbaka till exakt 1:00) blir mätbart skild från "fortsätter räkna ner
  // därifrån den redan var".
  await page.waitForTimeout(2200);

  // Tre nya tryck nollställer timern — tillbaka till hela planerade tiden,
  // fortsatt IGÅNG (inte tillbaka till "ej startad").
  await card.click({ clickCount: 3 });
  await expect(card).toHaveAccessibleName(/1:00 kvar/);
  await expect(page.getByText("1:00")).toBeVisible();
});
