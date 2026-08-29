import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Belöningsvaror kan begränsas till valda veckodagar/tider (AvailabilityEditor.tsx)
// och till ett max antal köp per period (PurchaseLimitEditor.tsx). Flera
// "tidsfönster" (2026-08-29, Zaidas önskemål) — varje fönster har egna
// veckodagar + egna tider, t.ex. måndag 15-17 OCH onsdag 18-20 på samma vara.

const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};

type CreatedItem = {
  title?: string;
  availability?: { windows?: { daysOfWeek?: string[]; timeIntervals?: { start: string; end: string }[] }[] };
  purchaseLimit?: { max: number; period: string } | null;
};

function captureCreatedItem(page: Parameters<typeof mockAuthAndData>[0]) {
  let created: CreatedItem | null = null;
  void page.route(/\/api\/reward-shop\/items$/, (route) => {
    if (route.request().method() === "POST") {
      created = JSON.parse(route.request().postData() ?? "{}");
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  return () => created;
}

test.beforeEach(async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
});

async function openShopForm(page: Parameters<typeof mockAuthAndData>[0]) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "🏪 Belöningsbutiken" }).click();
  return page.locator(".reward-shop-settings");
}

test("Inställningar: begränsa en belöning till valda veckodagar i ett fönster", async ({ page }) => {
  const getCreated = captureCreatedItem(page);
  const section = await openShopForm(page);
  await section.getByPlaceholder("Belöningens namn").fill("Helgfilm");

  await section.getByRole("button", { name: "+ Begränsa när belöningen är tillgänglig" }).click();
  await section.getByRole("button", { name: "+ Lägg till tidsfönster" }).click();

  const days = page.getByRole("group", { name: "Veckodagar för fönster 1" });
  await days.getByRole("button", { name: "lör" }).click();
  await days.getByRole("button", { name: "sön" }).click();

  await section.getByRole("button", { name: "Lägg till", exact: true }).click();

  await expect.poll(getCreated).toMatchObject({
    title: "Helgfilm",
    availability: { windows: [{ daysOfWeek: ["saturday", "sunday"], timeIntervals: [] }] },
  });
});

test("Inställningar: inga tidsfönster tillagda sparas som alltid tillgänglig", async ({ page }) => {
  const getCreated = captureCreatedItem(page);
  const section = await openShopForm(page);
  await section.getByPlaceholder("Belöningens namn").fill("Alltid tillgänglig");
  await section.getByRole("button", { name: "+ Begränsa när belöningen är tillgänglig" }).click();
  await section.getByRole("button", { name: "Lägg till", exact: true }).click();

  await expect.poll(getCreated).toMatchObject({ availability: { windows: [] } });
});

test("Inställningar: två tidsfönster med olika dagar och olika tider på samma vara", async ({ page }) => {
  const getCreated = captureCreatedItem(page);
  const section = await openShopForm(page);
  await section.getByPlaceholder("Belöningens namn").fill("Skärmtid");

  await section.getByRole("button", { name: "+ Begränsa när belöningen är tillgänglig" }).click();

  await section.getByRole("button", { name: "+ Lägg till tidsfönster" }).click();
  await page.getByRole("group", { name: "Veckodagar för fönster 1" }).getByRole("button", { name: "mån" }).click();
  await section.getByRole("button", { name: "+ Lägg till tid" }).first().click();
  await page.getByLabel("Fönster 1, intervall 1 starttid").fill("15:00");
  await page.getByLabel("Fönster 1, intervall 1 sluttid").fill("17:00");

  await section.getByRole("button", { name: "+ Lägg till tidsfönster" }).click();
  await page.getByRole("group", { name: "Veckodagar för fönster 2" }).getByRole("button", { name: "ons" }).click();
  await section.getByRole("button", { name: "+ Lägg till tid" }).nth(1).click();
  await page.getByLabel("Fönster 2, intervall 1 starttid").fill("18:00");
  await page.getByLabel("Fönster 2, intervall 1 sluttid").fill("20:00");

  await section.getByRole("button", { name: "Lägg till", exact: true }).click();

  await expect.poll(getCreated).toMatchObject({
    title: "Skärmtid",
    availability: {
      windows: [
        { daysOfWeek: ["monday"], timeIntervals: [{ start: "15:00", end: "17:00" }] },
        { daysOfWeek: ["wednesday"], timeIntervals: [{ start: "18:00", end: "20:00" }] },
      ],
    },
  });
});

test("Inställningar: begränsa antal köp per period", async ({ page }) => {
  const getCreated = captureCreatedItem(page);
  const section = await openShopForm(page);
  await section.getByPlaceholder("Belöningens namn").fill("Extra godis");

  await section.getByRole("button", { name: "+ Begränsa antal köp" }).click();
  await section.getByLabel("Max antal").fill("2");
  await section.getByLabel("Period").selectOption("week");

  await section.getByRole("button", { name: "Lägg till", exact: true }).click();

  await expect.poll(getCreated).toMatchObject({
    title: "Extra godis",
    purchaseLimit: { max: 2, period: "week" },
  });
});
