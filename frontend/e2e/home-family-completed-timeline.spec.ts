import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// 2026-08-12, Zaidas önskemål: "hela familjens samlade avklarade todos
// (även deluppgifter) i en container fylld av dessa ikoner. Tänk en vågrät
// tidslinje över dagen (som den lodräta i dashboard) som innehåller hela
// familjens gemensamt samlade todo-ikoner." — ny sektion överst i Hem-vyns
// Todos-flik (FamilyCompletedTimeline.tsx), se todos/selectors.ts:s
// getFamilyCompletedTimelineItems.

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

test("Hem-vyns Todos-flik: avklarade todos OCH delmoment idag visas som ikoner på en vågrät tidslinje", async ({ page }) => {
  const now = new Date();
  const todayAt = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0).toISOString();

  const APPROVED_TODAY = todo({
    id: "todo-approved", title: "Handla mat", status: "approved",
    completedAt: todayAt(10), visual: { type: "lucide-icon", value: "🛒" }
  });
  const ROUTINE_WITH_SUBTASK = todo({
    id: "todo-routine", title: "Kvällsrutin", assignedTo: CHILD.id,
    subtasks: [{ id: "sub-1", title: "🧺Diska", done: true, completedAt: todayAt(18), assignedTo: CHILD.id }]
  });
  const STILL_PENDING = todo({ id: "todo-pending", title: "Väntar fortfarande" });

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: [APPROVED_TODAY, ROUTINE_WITH_SUBTASK, STILL_PENDING] });
    }
    return route.fulfill({ json: {} });
  });

  await openHomeTodosTab(page);

  const timeline = page.locator(".family-completed-timeline");
  await expect(timeline).toBeVisible();
  await expect(timeline.getByText("Idag i familjen")).toBeVisible();

  const icons = timeline.locator(".family-completed-timeline__icon");
  await expect(icons).toHaveCount(2);
  await expect(icons.filter({ hasText: "🛒" })).toHaveCount(1);
  await expect(icons.filter({ hasText: "🧺" })).toHaveCount(1);

  const subtaskIcon = icons.filter({ hasText: "🧺" });
  await expect(subtaskIcon).toHaveAttribute("title", /Diska — Nova/);
});

test("Hem-vyns Todos-flik: tom tidslinje visar en platshållartext när inget är avklarat idag", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [todo({ id: "todo-1", title: "Väntar" })] }));

  await openHomeTodosTab(page);

  const timeline = page.locator(".family-completed-timeline");
  await expect(timeline).toBeVisible();
  await expect(timeline.getByText("Inget avklarat än idag.")).toBeVisible();
  await expect(timeline.locator(".family-completed-timeline__icon")).toHaveCount(0);
});
