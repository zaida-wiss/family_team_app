/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// 2026-08-06, Zaidas fynd: "när jag ska redigera familjens todo så står det
// andra kategorier än de som finns i familjen" — TodoEditModal (öppnad från
// pennikonen i TodoDetailView) filtrerade sin kategori-dropdown ALLTID på
// `!isFamily`, oavsett om modalen öppnats från den personliga Todos-panelen
// eller från Hem-vyns familjetrådar (sedan 2026-08-04) — visade alltså
// Zaidas egna PERSONLIGA kategorier istället för familjens, när man
// redigerar en familjeuppgift.

const FAMILY_CATEGORY = {
  id: "cat-family-rutiner", accountId: "acc-1", memberId: "mem-1", name: "Rutiner",
  isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
};
const PERSONAL_CATEGORY = {
  id: "cat-personal-skola", accountId: "acc-1", memberId: "mem-1", name: "Skola",
  isFamily: false, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
};
const FAMILY_TODO = {
  id: "todo-kvall", accountId: "acc-1", title: "Kvällsrutiner", createdBy: "mem-1",
  assignedTo: null, isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: "cat-family-rutiner", notes: null
};

test("Hem-vyns familjetrådar: redigera-modalens kategori-dropdown visar familjekategorier, inte mina personliga", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [FAMILY_CATEGORY, PERSONAL_CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [FAMILY_TODO] });
    return route.fulfill({ json: {} });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  await page.getByRole("button", { name: /^Kvällsrutiner,/ }).click();
  await page.getByRole("button", { name: "Redigera uppgift" }).click();

  const categorySelect = page.getByLabel("Kategori");
  await expect(categorySelect.getByRole("option", { name: "Rutiner" })).toBeAttached();
  await expect(categorySelect.getByRole("option", { name: "Skola" })).not.toBeAttached();
});

// 2026-08-06, Zaidas fynd: "det är även fortfarande problem med
// autentisering och behörighet att radera todos" — TodoEditModal.tsx:s
// handleDelete stängde modalen OVILLKORLIGT direkt efter att onDeleteTodo
// anropats, utan att någonsin läsa av resultatet — en nekad radering
// (softDeleteTodo's klientsidiga canDeleteTodo-förkoll, useTodosState.ts)
// gav alltså varken felmeddelande eller kvarhållen modal, bara "ingenting
// händer". Ingen DELETE-request ska ens skickas (blockeras redan
// klientsidan) och ett tydligt fel ska visas istället.
test("Hem-vyns familjetrådar: en nekad radering (ingen behörighet) visar ett tydligt fel istället för att bara stänga modalen tyst", async ({ page }) => {
  const RESTRICTED_ROLE = {
    id: "role-1", name: "Utan raderingsbehörighet", isChildRole: false,
    permissions: {
      canManageMembers: true, canManageRoles: true, canSeeAllTodos: true, canSeeOwnTodos: true,
      canCreateTodos: true, canScheduleRecurringTodos: true, canCompleteAssignedTodos: true,
      canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: true, canSeeAllCalendar: true,
      canSeeOwnCalendar: true, canCreateCalendar: true, canEditCalendar: true, canImportCalendar: true,
      canExportCalendar: true, canSeeShoppingLists: true, canCreateShoppingLists: true,
      canEditShoppingLists: true, canViewTrash: true, canRestoreFromTrash: true,
      canCreateChildAccounts: true, canManageChildTodos: true
    }
  };
  const NOT_MY_TODO = {
    id: "todo-not-mine", accountId: "acc-1", title: "Skapad av någon annan", createdBy: "mem-annan",
    assignedTo: null, isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let deleteCalled = false;

  await mockAuthAndData(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [RESTRICTED_ROLE] }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [NOT_MY_TODO] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-not-mine", (route) => {
    if (route.request().method() === "DELETE") deleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  await page.getByRole("button", { name: /^Skapad av någon annan,/ }).click();
  await page.getByRole("button", { name: "Redigera uppgift" }).click();
  await page.getByRole("button", { name: "Radera" }).click();

  await expect(page.getByText(/Kunde inte radera/)).toBeVisible();
  expect(deleteCalled).toBe(false);
  // Modalen ska INTE ha stängts — redigeringsfältet är fortfarande synligt.
  await expect(page.getByLabel("Kategori")).toBeVisible();
});
