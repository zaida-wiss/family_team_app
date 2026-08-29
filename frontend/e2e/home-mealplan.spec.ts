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
  await page.getByRole("tab", { name: "Visa måltidsplanering" }).click();

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

// 2026-08-01, Zaidas rättelse: "man ska inte heller kunna planera måltider
// med andra familjer, utan då måste man först göra en familj med dessa
// familjer som medlemmar" — måltidsplanering fungerar nu FÖR Mina
// familjekonton (genuint medlemskap, family-across-accounts), men INTE för
// en Familjeanslutning (todos/connections, ingen egen identitet där).
test("Måltidsplanering: tillgänglig för Mina familjekonton, INTE för en Familjeanslutning", async ({ page }) => {
  const ACCOUNT_A = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null };
  await mockAuthAndData(page);
  await page.route("**/api/recipes", (route) => route.fulfill({ json: [RECIPE] }));
  await page.route("**/api/meal-plan**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/meal-plan/cross-account**", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", entries: [] }] })
  );
  await page.route("**/api/recipes/cross-account", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", recipes: [RECIPE] }] })
  );
  await page.route("**/api/todos/family-across-accounts", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", todos: [] }] })
  );
  // Familjen C — bara en Familjeanslutning, ingen genuin identitet där.
  await page.route("**/api/todos/connections", (route) =>
    route.fulfill({ json: [{ accountId: "acc-c", accountName: "Familjen C", access: "edit", todos: [] }] })
  );

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa måltidsplanering" }).click();
  // Familjeväljaren ligger sedan 2026-08-29 i Hem-panelens nya standardvy
  // (ingen egen "Visa medlemmar"-flik längre, se MemberOverview.tsx) —
  // ett klick på Hem (HeroBar) landar alltid där, oavsett vilken Hem-flik
  // som råkar vara aktiv sedan tidigare (se useAppState.ts:s setActivePanel
  // för samma-panel-specialfallet). Helper:n växlar alltid tillbaka till
  // Måltidsplanering efteråt.
  const mealplanTab = page.getByRole("tab", { name: "Visa måltidsplanering" });
  async function selectFamily(label: string) {
    await page.getByRole("button", { name: "Hem", exact: true }).click();
    await page.getByLabel("Familjeval").getByRole("button", { name: label }).click();
    await mealplanTab.click();
  }

  // Familjen B (Mina familjekonton) — riktig måltidsplan, ingen "inte
  // tillgänglig"-text.
  await selectFamily("Familjen B");
  await expect(page.getByText("Måltidsplanering kräver att du är en riktig medlem")).toHaveCount(0);
  await expect(page.locator(".mealplan__grid")).toBeVisible();

  // Familjen C (bara en Familjeanslutning) — fortsatt inte tillgänglig.
  await selectFamily("Familjen C");
  await expect(page.getByText("Måltidsplanering kräver att du är en riktig medlem")).toBeVisible();

  await selectFamily(ACCOUNT_A.name);
  await expect(page.getByText("Måltidsplanering kräver att du är en riktig medlem")).toHaveCount(0);
});
