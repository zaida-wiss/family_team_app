import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// 2026-08-12, Zaidas önskemål: "hela familjens samlade avklarade todos
// (även deluppgifter) i en container fylld av dessa ikoner." — ny sektion
// i Hem-vyns Todos-flik (FamilyCompletedTimeline.tsx), se todos/selectors.ts:s
// getFamilyCompletedTimelineItems. Ursprungligen en vågrät tidslinje med
// timmarkeringar, om till en enkel lista i läsordning 2026-08-15 (Zaida:
// "Tidslinjen gör höjden för hög. Ta bort tidslinjen och låt ikonerna komma
// i turordning och gå i läsordning i den ordning som familjen avklarar
// uppgifter").

const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null
};

function todo(overrides: Record<string, unknown>) {
  return {
    accountId: "acc-1", createdBy: "mem-1", assignedTo: "mem-1", isShared: false,
    status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "Star" },
    recurrence: { type: "none" }, recurringSourceId: null, occurrenceDate: null,
    completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null,
    ...overrides
  };
}

async function openHomeTodosTab(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();
}

test("Hem-vyns Todos-flik: avklarade todos OCH delmoment idag visas som ikoner i läsordning, inklusive barnens", async ({ page }) => {
  const now = new Date();
  const todayAt = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0).toISOString();

  // Skickas medvetet i FEL (icke-kronologisk) ordning från API:t (18, 10, 6)
  // för att verifiera att listan faktiskt sorteras om till turordning
  // (completedAt stigande), inte bara returnerar API-svarets egen ordning.
  const ROUTINE_WITH_SUBTASK = todo({
    id: "todo-routine", title: "Kvällsrutin", assignedTo: CHILD.id,
    subtasks: [{ id: "sub-1", title: "🧺Diska", done: true, completedAt: todayAt(18), assignedTo: CHILD.id }]
  });
  const APPROVED_TODAY = todo({
    id: "todo-approved", title: "Handla mat", status: "approved",
    completedAt: todayAt(10), visual: { type: "lucide-icon", value: "🛒" }
  });
  const CHILD_TODO = todo({
    id: "todo-child", title: "Borsta tänder", assignedTo: CHILD.id, status: "approved",
    completedAt: todayAt(6), visual: { type: "lucide-icon", value: "🦷" }
  });
  const STILL_PENDING = todo({ id: "todo-pending", title: "Väntar fortfarande" });

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: [ROUTINE_WITH_SUBTASK, APPROVED_TODAY, CHILD_TODO, STILL_PENDING] });
    }
    return route.fulfill({ json: {} });
  });

  await openHomeTodosTab(page);

  const timeline = page.locator(".family-completed-timeline");
  await expect(timeline).toBeVisible();
  await expect(timeline.getByText("Idag i familjen")).toBeVisible();

  const icons = timeline.locator(".family-completed-timeline__icon");
  await expect(icons).toHaveCount(3);
  // Läsordning = turordning familjen avklarade uppgifterna i (06, 10, 18),
  // inte den ordning de råkade ligga i API-svaret (18, 10, 06).
  await expect(icons.nth(0)).toContainText("🦷");
  await expect(icons.nth(1)).toContainText("🛒");
  await expect(icons.nth(2)).toContainText("🧺");

  const subtaskIcon = icons.filter({ hasText: "🧺" });
  await expect(subtaskIcon).toHaveAttribute("title", /Diska — Nova/);
});

test("Hem-vyns Todos-flik: ikonerna har den utförande medlemmens färg som bakgrund, samt en räknare för dagens totalantal (2026-08-15, Zaida: se vem som utfört uppgifterna + hur många idag)", async ({ page }) => {
  const now = new Date();
  const todayAt = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0).toISOString();
  const memberWithColor = { ...MEMBER, color: "#3366ff" };
  const childWithColor = { ...CHILD, color: "#ff3366" };

  const MINE = todo({ id: "todo-mine", title: "Diska", status: "approved", completedAt: todayAt(9), assignedTo: memberWithColor.id });
  const CHILD_TODO = todo({ id: "todo-child", title: "Borsta tänder", assignedTo: childWithColor.id, status: "approved", completedAt: todayAt(10) });

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [memberWithColor, childWithColor] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [MINE, CHILD_TODO] });
    return route.fulfill({ json: {} });
  });

  await openHomeTodosTab(page);

  const timeline = page.locator(".family-completed-timeline");
  await expect(timeline.locator(".family-completed-timeline__count")).toHaveText("2");

  const icons = timeline.locator(".family-completed-timeline__icon");
  await expect(icons.nth(0)).toHaveCSS("background-color", "rgb(51, 102, 255)");
  await expect(icons.nth(1)).toHaveCSS("background-color", "rgb(255, 51, 102)");
});

test("Hem-vyns Todos-flik: Visa statistik hämtar och visar de senaste 14 dagarnas trend, lat-hämtad först vid utfällning", async ({ page }) => {
  let statsRequested = false;
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/completed-stats", (route) => {
    statsRequested = true;
    return route.fulfill({ json: [now.toISOString(), now.toISOString(), yesterday.toISOString()] });
  });

  await openHomeTodosTab(page);

  const timeline = page.locator(".family-completed-timeline");
  expect(statsRequested).toBe(false);

  await timeline.getByRole("button", { name: "Visa statistik" }).click();

  const stats = timeline.locator(".family-completed-stats");
  await expect(stats).toBeVisible();
  await expect(stats.getByText("3 avklarade de senaste 14 dagarna")).toBeVisible();
  expect(statsRequested).toBe(true);
  await expect(stats.locator(".family-completed-stats__col")).toHaveCount(14);

  await timeline.getByRole("button", { name: "Dölj statistik" }).click();
  await expect(stats).toBeHidden();
});

test("Hem-vyns Todos-flik: tom lista visar en platshållartext när inget är avklarat idag", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [todo({ id: "todo-1", title: "Väntar" })] }));

  await openHomeTodosTab(page);

  const timeline = page.locator(".family-completed-timeline");
  await expect(timeline).toBeVisible();
  await expect(timeline.getByText("Inget avklarat än idag.")).toBeVisible();
  await expect(timeline.locator(".family-completed-timeline__icon")).toHaveCount(0);
});
