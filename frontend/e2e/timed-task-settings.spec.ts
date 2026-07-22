import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Sprint 4 S2: föräldern skapar en tidtagen uppgift (Medaljer/Rekord) i Inställningar.

const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};

const CHILD = {
  id: "mem-2", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-1", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};

test("Inställningar: skapa en tidtagen uppgift åt ett barn", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));

  let created: { title?: string; assignedTo?: string } | null = null;
  await page.route("**/api/timed-tasks", (route) => {
    if (route.request().method() === "POST") {
      created = JSON.parse(route.request().postData() ?? "{}");
      return route.fulfill({ status: 201, json: { id: "tt-1" } });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "🏃 Medaljer/Rekord" }).click();

  const section = page.locator(".timed-task-settings");
  await section.getByPlaceholder("Uppgiftens namn").fill("Springa ett varv");
  await section.getByRole("button", { name: "Lägg till" }).click();

  await expect.poll(() => created).toMatchObject({ title: "Springa ett varv", assignedTo: "mem-2" });
});
