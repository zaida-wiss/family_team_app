import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// S1 (Sprint 3): "godkänd todo studsar tillbaka" — approveTodo/rejectTodo saknade rollback
// vid API-fel, till skillnad från approveWish som redan gjorde detta. Testet verifierar att
// en misslyckad godkänn-begäran återställer den optimistiska uppdateringen istället för att
// tyst lämna uppgiften i ett tillstånd som aldrig sparades på servern.
//
// 2026-07-05: godkännande flyttat från Todos-panelen till Inställningar → Barn
// (samtidigt som en vuxens EGNA uppgifter slutade behöva godkännande alls,
// se ADR/backlogg samma dag) — todon här tilldelas nu ett riktigt barn och
// testet navigerar dit istället.

const CHILD_MEMBER = {
  id: "mem-child-1", accountId: "acc-1", userId: null,
  name: "Barnet", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
};

const DONE_TODO = {
  id: "todo-1",
  accountId: "acc-1",
  title: "Duka bordet",
  createdBy: "mem-1",
  assignedTo: "mem-child-1",
  isShared: false,
  status: "done",
  starValue: 5,
  visual: { type: "lucide-icon", value: "Star" },
  recurrence: { type: "none" },
  completedAt: new Date().toISOString(),
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectedReason: null,
  expiresAt: null,
  recurringSourceId: null,
  occurrenceDate: null,
  deletedAt: null,
  deletedBy: null,
};

async function openChildApproval(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "Barnkonton" }).click();
}

test.describe("Todo-godkännande — rollback vid API-fel", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndData(page);
    await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD_MEMBER] }));
    await page.route("**/api/todos", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: [DONE_TODO] });
      }
      return route.fulfill({ json: DONE_TODO });
    });
  });

  test("godkänn-knapp: uppgiften kommer tillbaka i godkännandelistan om API-anropet misslyckas", async ({ page }) => {
    await page.route("**/api/todos/todo-1/approve", (route) =>
      route.fulfill({ status: 500, json: { error: "Serverfel" } })
    );

    await openChildApproval(page);

    const approvalPanel = page.getByRole("region", { name: "Barnens godkännanden" });
    await expect(approvalPanel.getByText("Duka bordet")).toBeVisible();

    await approvalPanel.getByTitle("Godkänn").click();

    // Rollback ska ta uppgiften tillbaka till "väntar på godkännande" — inte lämna den
    // permanent markerad som godkänd trots att servern avvisade anropet.
    await expect(approvalPanel.getByText("Duka bordet")).toBeVisible();
  });
});
