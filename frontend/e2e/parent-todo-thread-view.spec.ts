import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Sprint 6 S2+S3: Föräldravyn med delmoment — "bollar i tråd per kategori", en
// vy-växlare i den befintliga Todos-panelen. Kort tryck på en boll med delmoment
// öppnar en avbockningsbar checklista-modal (ADR-0012:s useModalA11y).

const TODO_WITH_SUBTASKS = {
  id: "todo-1", accountId: "acc-1", title: "Städa rummet", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 5,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  routineCategory: "Hälsa",
  subtasks: [
    { id: "sub-1", title: "Plocka undan leksaker", done: true },
    { id: "sub-2", title: "Dammsug golvet", done: false }
  ]
};

const TODO_NO_SUBTASKS = {
  id: "todo-2", accountId: "acc-1", title: "Diska", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 3,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  routineCategory: null
};

test("Bollar i tråd: grupperar på kategori och visar progression", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO_WITH_SUBTASKS, TODO_NO_SUBTASKS] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();
  await page.getByRole("button", { name: "Bollar i tråd" }).click();

  await expect(page.getByRole("region", { name: "Tråd: Hälsa" }).getByText("Städa rummet")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tråd: Övrigt" }).getByText("Diska")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tråd: Trivsel" }).getByText("Allt avklarat här")).toBeVisible();
  await expect(page.getByRole("button", { name: /Städa rummet.*50 procent/ })).toBeVisible();
});

test("Bollar i tråd: kort tryck öppnar checklista-modal, avbockning anropar API:et", async ({ page }) => {
  let toggledSubtaskId: string | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TODO_WITH_SUBTASKS] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-1/subtasks/sub-2", (route) => {
    toggledSubtaskId = "sub-2";
    return route.fulfill({ json: { done: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();
  await page.getByRole("button", { name: "Bollar i tråd" }).click();
  await page.getByRole("button", { name: /Städa rummet/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("50% klart")).toBeVisible();

  const doneCheckbox = dialog.getByRole("checkbox", { name: "Plocka undan leksaker" });
  const pendingCheckbox = dialog.getByRole("checkbox", { name: "Dammsug golvet" });
  await expect(doneCheckbox).toBeChecked();
  await expect(pendingCheckbox).not.toBeChecked();

  await pendingCheckbox.click();
  await expect.poll(() => toggledSubtaskId).toBe("sub-2");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Bollar i tråd: en boll utan delmoment går inte att öppna", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO_NO_SUBTASKS] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();
  await page.getByRole("button", { name: "Bollar i tråd" }).click();

  const ball = page.getByRole("button", { name: /Diska/ });
  await expect(ball).toBeDisabled();
});

test("Bollar i tråd: växlar tillbaka till listan", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO_WITH_SUBTASKS] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();
  await page.getByRole("button", { name: "Bollar i tråd" }).click();
  await expect(page.getByRole("region", { name: "Tråd: Hälsa" })).toBeVisible();

  await page.getByRole("button", { name: "Lista" }).click();
  await expect(page.getByRole("region", { name: "Tråd: Hälsa" })).toHaveCount(0);
  await expect(page.getByText("Städa rummet")).toBeVisible();
});
