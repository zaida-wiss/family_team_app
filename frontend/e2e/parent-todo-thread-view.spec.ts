import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Sprint 6 S2: Föräldravyn med delmoment — "bollar i tråd per kategori", en
// vy-växlare i den befintliga Todos-panelen (inte en ny separat panel, se
// sprint-review-2026-07-04-sprint6.md). Tråden töms när uppgifterna görs.

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

const TODO_NO_CATEGORY = {
  id: "todo-2", accountId: "acc-1", title: "Diska", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 3,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  routineCategory: null
};

test("Bollar i tråd: grupperar på kategori, visar progression, expanderar delmoment", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO_WITH_SUBTASKS, TODO_NO_CATEGORY] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  await page.getByRole("button", { name: "Bollar i tråd" }).click();

  await expect(page.getByRole("region", { name: "Tråd: Hälsa" }).getByText("Städa rummet")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tråd: Övrigt" }).getByText("Diska")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tråd: Trivsel" }).getByText("Allt avklarat här")).toBeVisible();

  const ball = page.getByRole("button", { name: /Städa rummet.*50 procent/ });
  await expect(ball).toBeVisible();

  await ball.click();
  await expect(page.getByText("Plocka undan leksaker")).toBeVisible();
  await expect(page.getByText("Dammsug golvet")).toBeVisible();
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
