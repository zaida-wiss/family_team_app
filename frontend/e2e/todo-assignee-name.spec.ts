import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// S2 (Sprint 3): "Okänt barn" i todo-historiken. Root cause: TodosView fick bara
// activeMembers (deletedAt === null) för namn-uppslag, så en todo som tillhör ett
// borttaget (mjukraderat) barn kunde aldrig slå upp namnet igen — trots att barnet
// bara är dolt, inte raderat. Fixen skickar in den ofiltrerade medlemslistan separat
// (allMembers) enbart för namn-uppslag i historiken.

const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};

const REMOVED_CHILD = {
  id: "mem-2", accountId: "acc-1", userId: null,
  name: "Astrid", roleId: "role-1", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: "2026-06-01T00:00:00.000Z", deletedBy: "mem-1",
};

const TODO_FOR_REMOVED_CHILD = {
  id: "todo-1",
  accountId: "acc-1",
  title: "Läxor",
  createdBy: "mem-1",
  assignedTo: "mem-2",
  isShared: false,
  status: "pending",
  starValue: 3,
  visual: { type: "lucide-icon", value: "Star" },
  recurrence: { type: "none" },
  completedAt: null,
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectedReason: null,
  visibleFrom: null,
  expiresAt: null,
  recurringSourceId: null,
  occurrenceDate: null,
  deletedAt: null,
  deletedBy: null,
};

test("Todos: uppgift som tillhör ett borttaget barn visar barnets namn, inte Okänt barn", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, REMOVED_CHILD] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: [TODO_FOR_REMOVED_CHILD] });
    }
    return route.fulfill({ json: TODO_FOR_REMOVED_CHILD });
  });

  await page.goto("/");
  // Tråd-läget (bubbelvyn) är default sedan 2026-07-05, listläget väljs i
  // Inställningar (ingen egen växlare i panelen) — den här testen
  // kontrollerar listlägets assignee-namn, växlar dit explicit.
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByLabel("Todos-vy").selectOption("list");
  await page.getByRole("button", { name: "Todos" }).click();

  await expect(page.getByText("Läxor")).toBeVisible();
  await expect(page.getByText("Astrid")).toBeVisible();
  await expect(page.getByText("Okänt barn")).toHaveCount(0);
});
