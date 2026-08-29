import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Belöningsvaror kan begränsas till valda veckodagar (AvailabilityEditor.tsx),
// samma "kryssrutor för veckodagar"-mönster som återkommande todos redan har.

const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};

test("Inställningar: begränsa en belöning till valda veckodagar", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));

  let created: { title?: string; availability?: { daysOfWeek?: string[] } } | null = null;
  await page.route(/\/api\/reward-shop\/items$/, (route) => {
    if (route.request().method() === "POST") {
      created = JSON.parse(route.request().postData() ?? "{}");
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "🏪 Belöningsbutiken" }).click();

  const section = page.locator(".reward-shop-settings");
  await section.getByPlaceholder("Belöningens namn").fill("Helgfilm");

  await section.getByRole("button", { name: "+ Begränsa när belöningen är tillgänglig" }).click();
  const days = page.getByRole("group", { name: "Veckodagar" });
  await days.getByRole("button", { name: "lör" }).click();
  await days.getByRole("button", { name: "sön" }).click();

  await section.getByRole("button", { name: "Lägg till", exact: true }).click();

  await expect.poll(() => created).toMatchObject({
    title: "Helgfilm",
    availability: { daysOfWeek: ["saturday", "sunday"] },
  });
});

test("Inställningar: tomt veckodagsval sparas som alla dagar", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));

  let created: { availability?: { daysOfWeek?: string[] } } | null = null;
  await page.route(/\/api\/reward-shop\/items$/, (route) => {
    if (route.request().method() === "POST") {
      created = JSON.parse(route.request().postData() ?? "{}");
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "🏪 Belöningsbutiken" }).click();

  const section = page.locator(".reward-shop-settings");
  await section.getByPlaceholder("Belöningens namn").fill("Alltid tillgänglig");
  await section.getByRole("button", { name: "+ Begränsa när belöningen är tillgänglig" }).click();
  await section.getByRole("button", { name: "Lägg till", exact: true }).click();

  await expect.poll(() => created).toMatchObject({ availability: { daysOfWeek: [] } });
});
