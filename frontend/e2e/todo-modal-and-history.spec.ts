import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// S3 (Sprint 3): "Skapa todo" flyttad från inline-formulär till modal; historik
// (godkända/nekade uppgifter) flyttad ur den aktiva Todos-vyn till en skrollbar
// sektion i Inställningar, så den aktiva vyn inte samlar på sig avslutad historik.

const APPROVED_TODO = {
  id: "todo-approved",
  accountId: "acc-1",
  title: "Diska",
  createdBy: "mem-1",
  assignedTo: "mem-1",
  status: "approved",
  starValue: 4,
  completedAt: "2026-06-01T10:00:00.000Z",
  approvedBy: "mem-1",
  approvedAt: "2026-06-01T11:00:00.000Z",
  rejectedBy: null,
  rejectedAt: null,
  rejectedReason: null,
  expiresAt: null,
  recurringSourceId: null,
  occurrenceDate: null,
  deletedAt: null,
  deletedBy: null,
};

const PENDING_TODO = {
  ...APPROVED_TODO,
  id: "todo-pending",
  title: "Dammsuga",
  status: "pending",
  completedAt: null,
  approvedBy: null,
  approvedAt: null,
};

// Reproducerar buggen Zaida hittade i produktion 3 juli: expired räknades inte som
// historik i första versionen av S3, så utgångna uppgifter fortsatte synas i den
// aktiva Todos-listan.
const EXPIRED_TODO = {
  ...APPROVED_TODO,
  id: "todo-expired",
  title: "Duka undan",
  status: "expired",
  completedAt: null,
  approvedBy: null,
  approvedAt: null,
  expiresAt: "2026-06-02T00:00:00.000Z",
};

test.describe("Todos: skapa-modal och historik i Inställningar", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndData(page);
  });

  test("Skapa todo öppnas som modal, inte inline-formulär", async ({ page }) => {
    await page.route("**/api/todos", (route) =>
      route.fulfill({ json: route.request().method() === "GET" ? [] : {} })
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Todos" }).click();

    await expect(page.getByRole("dialog", { name: "Skapa todo" })).toHaveCount(0);
    await page.getByRole("button", { name: "Skapa todo" }).click();
    await expect(page.getByRole("dialog", { name: "Skapa todo" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Skapa todo" })).toHaveCount(0);
  });

  test("Godkänd och utgången uppgift visas inte i aktiva Todos-listan, men syns i Inställningars historik", async ({ page }) => {
    await page.route("**/api/todos", (route) =>
      route.fulfill({ json: route.request().method() === "GET" ? [APPROVED_TODO, PENDING_TODO, EXPIRED_TODO] : {} })
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Todos" }).click();

    await expect(page.getByText("Dammsuga")).toBeVisible();
    await expect(page.getByText("Diska")).toHaveCount(0);
    await expect(page.getByText("Duka undan")).toHaveCount(0);

    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "📋 Todo-historik" }).click();

    await expect(page.getByText("Diska")).toBeVisible();
    await expect(page.getByText("Godkänd", { exact: true })).toBeVisible();
    await expect(page.getByText("Duka undan")).toBeVisible();
    await expect(page.getByText("Utgången", { exact: true })).toBeVisible();
  });
});
