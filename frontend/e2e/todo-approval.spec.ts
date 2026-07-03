import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// S1 (Sprint 3): "godkänd todo studsar tillbaka" — approveTodo/rejectTodo saknade rollback
// vid API-fel, till skillnad från approveWish som redan gjorde detta. Testet verifierar att
// en misslyckad godkänn-begäran återställer den optimistiska uppdateringen istället för att
// tyst lämna uppgiften i ett tillstånd som aldrig sparades på servern.

const DONE_TODO = {
  id: "todo-1",
  accountId: "acc-1",
  title: "Duka bordet",
  createdBy: "mem-1",
  assignedTo: "mem-1",
  status: "done",
  starValue: 5,
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

test.describe("Todo-godkännande — rollback vid API-fel", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndData(page);
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

    await page.goto("/");
    await page.getByRole("button", { name: "Todos" }).click();

    const approvalPanel = page.getByRole("region", { name: "Uppgifter att godkänna" });
    await expect(approvalPanel.getByText("Duka bordet")).toBeVisible();

    await approvalPanel.getByTitle("Godkänn").click();

    // Rollback ska ta uppgiften tillbaka till "väntar på godkännande" — inte lämna den
    // permanent markerad som godkänd trots att servern avvisade anropet.
    await expect(approvalPanel.getByText("Duka bordet")).toBeVisible();
  });
});
