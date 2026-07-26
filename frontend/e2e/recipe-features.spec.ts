import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Tre samlade receptfynd (2026-07-26, Zaidas önskemål): (1) import/export
// flyttat till en egen "Recept"-kategori i Inställningar, inte längre synligt
// i själva receptvyn ("istället för i receptvyn"); (2) Antal personer-fält;
// (3) "följ steg för steg" — kryssrutor (överstrukna/tonade när avbockade)
// + en timer per tidsstyrt steg som ligger i localStorage (useRecipeCooking
// Session.ts), inte lokal komponent-state, så den inte bryts av en
// panelväxling.

const RECIPE = {
  id: "recipe-1",
  accountId: "acc-1",
  name: "Köttfärssås",
  emoji: "🍝",
  imageUrl: null,
  sourceUrl: null,
  servings: 4,
  ingredients: [{ id: "ing-1", text: "500 g köttfärs" }],
  steps: [
    { id: "step-1", text: "Fräs köttfärsen", timedMinutes: null },
    { id: "step-2", text: "Sätt in i ugnen", timedMinutes: 25 }
  ],
  tags: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  createdBy: "mem-1",
  deletedAt: null,
  deletedBy: null,
};

async function mockRecipes(page: import("@playwright/test").Page, recipes: (typeof RECIPE)[]) {
  await page.route("**/api/recipes", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: recipes }) : route.fulfill({ json: recipes[0] })
  );
}

test("Inställningar: en egen Recept-kategori har import/export, receptvyn har det inte längre", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, [RECIPE]);

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await expect(page.getByText("Köttfärssås")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ladda ner mall (CSV)" })).toHaveCount(0);

  await page.getByRole("button", { name: "Inställningar" }).click();
  // Scopat till kategori-rutnätet — "Recept" krockar annars med huvudnavets
  // egen "Recept"-nav-knapp (samma strict-mode-fälla som redan dokumenterats
  // för "Inställningar" i child-login.spec.ts, 2026-07-22).
  await page.locator(".settings-category-grid").getByRole("button", { name: "Recept" }).click();
  await expect(page.getByRole("button", { name: "Ladda ner mall (CSV)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportera mina recept (CSV)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importera från CSV" })).toBeVisible();
});

test("Receptvyn visar antal personer, ett tidsstyrt steg har en Starta timer-knapp", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, [RECIPE]);

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();

  const dialog = page.getByRole("dialog", { name: /Köttfärssås/ });
  await expect(dialog.getByText("4 personer")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /25 min/ })).toBeVisible();
});

test("Kryssar av ett steg — tonas ner/överstruks, kryssrutan är kvar bockad efter att modalen stängs och öppnas igen", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, [RECIPE]);

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();

  const dialog = page.getByRole("dialog", { name: /Köttfärssås/ });
  const checkbox = dialog.getByLabel("Steg klart: Fräs köttfärsen");
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();

  // "Tonas ner" — den avbockade raden får en egen modifierarklass
  // (recipe-detail__step--checked, strikethrough+opacity i RecipesView.css).
  const stepRow = dialog.locator(".recipe-detail__step", { hasText: "Fräs köttfärsen" });
  await expect(stepRow).toHaveClass(/recipe-detail__step--checked/);

  // Stäng och öppna igen — kryssrutan ligger i localStorage (2026-07-26,
  // "en timer som inte bryts när man växlar mellan olika sidor"), inte
  // lokal komponent-state, så den ska ligga kvar bockad.
  await page.getByRole("button", { name: "Tillbaka" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();
  await expect(page.getByRole("dialog", { name: /Köttfärssås/ }).getByLabel("Steg klart: Fräs köttfärsen")).toBeChecked();
});

test("Startar en timer på ett tidsstyrt steg — överlever att man stänger receptet och öppnar det igen", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, [RECIPE]);

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();

  const dialog = page.getByRole("dialog", { name: /Köttfärssås/ });
  await dialog.getByRole("button", { name: /25 min/ }).click();

  // Nedräkningen visas nu istället för Starta-knappen.
  await expect(dialog.locator(".recipe-detail__step-timer-running")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /25 min/ })).toHaveCount(0);

  // Stäng och öppna igen — timern (en absolut tidsstämpel i localStorage)
  // ska fortfarande räkna, inte ha nollställts.
  await page.getByRole("button", { name: "Tillbaka" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();
  await expect(page.getByRole("dialog", { name: /Köttfärssås/ }).locator(".recipe-detail__step-timer-running")).toBeVisible();
});
