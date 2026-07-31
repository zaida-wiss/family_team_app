import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Vecko-måltidsplanering (2026-07-31, Zaidas önskemål: "en måltidsplanering"
// — ett av fyra flikval bredvid Hem-vyns familjefilter). Lägg till/ta bort
// ett recept för en dag+måltid.

const RECIPE = {
  id: "recipe-1", accountId: "acc-1", name: "Pannkakor", emoji: null, imageUrl: null, sourceUrl: null,
  ingredients: [], steps: [], servings: null, tags: [], createdAt: "2024-01-01T00:00:00.000Z",
  createdBy: "mem-1", deletedAt: null, deletedBy: null
};

test("Måltidsplanering: lägga till och ta bort ett recept för en dag+måltid", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/recipes", (route) => route.fulfill({ json: [RECIPE] }));
  await page.route("**/api/meal-plan**", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { date: string; mealSlot: string; recipeId: string };
      return route.fulfill({
        status: 201,
        json: { id: "mealplan-1", accountId: "acc-1", createdBy: "mem-1", deletedAt: null, deletedBy: null, ...body }
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Visa måltidsplanering" }).click();

  await expect(page.getByText("Inga recept ännu")).toHaveCount(0);

  // Första dagens Frukost-slot — lägg till receptet.
  const addButtons = page.locator(".mealplan__add");
  await addButtons.first().click();
  await page.locator(".mealplan select").first().selectOption({ label: "Pannkakor" });

  const entry = page.locator(".mealplan__entry", { hasText: "Pannkakor" });
  await expect(entry).toBeVisible();

  // Ta bort igen.
  await entry.getByRole("button").click();
  await expect(entry).toHaveCount(0);
});

test("Måltidsplanering: ingen tillgänglig för en annan familj i familjefiltret", async ({ page }) => {
  const ACCOUNT_A = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null };
  await mockAuthAndData(page);
  await page.route("**/api/recipes", (route) => route.fulfill({ json: [RECIPE] }));
  await page.route("**/api/meal-plan**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos/family-across-accounts", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", todos: [] }] })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Visa måltidsplanering" }).click();
  const familyFilter = page.getByLabel("Familj");
  await expect(familyFilter).toBeVisible();

  await familyFilter.selectOption({ label: "Familjen B" });
  await expect(page.getByText("Måltidsplanering delas ännu inte mellan familjer")).toBeVisible();

  await familyFilter.selectOption({ label: ACCOUNT_A.name });
  await expect(page.getByText("Måltidsplanering delas ännu inte mellan familjer")).toHaveCount(0);
});
