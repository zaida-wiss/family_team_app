import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Recept (2026-07-25, ADR-0028). Zaida rapporterade upprepade gånger
// (2026-07-26) att radering "inte gjorde något" — en riktig e2e-körning
// mot en simulerad backend visade aldrig något fel i själva klick-/API-
// flödet, men fanns ingen permanent testtäckning för det innan denna fil.
// Raderaknappen kräver numera ett eget redigeringsläge (Pennikon-toggle i
// receptvyns knapprad, skild från header-pennan som öppnar hela
// redigeringsformuläret) — samma "ingenting raderbart utan Redigera
// först"-princip som inköpslistorna redan följer.

const RECIPE = {
  id: "recipe-1",
  accountId: "acc-1",
  name: "Köttfärssås",
  emoji: "🍝",
  imageUrl: null,
  sourceUrl: null,
  ingredients: [{ id: "ing-1", text: "500 g köttfärs" }],
  steps: [{ id: "step-1", text: "Fräs köttfärsen", timedMinutes: null }],
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

test("Recept: raderaknappen nås via redigera-formuläret, radering anropar API:et och tar bort receptet", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, [RECIPE]);
  let deleteCalled = false;
  await page.route("**/api/recipes/recipe-1", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deleteCalled = true;
    route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await expect(page.getByText("Köttfärssås")).toBeVisible();
  await page.getByRole("button", { name: "Köttfärssås" }).click();

  const detailDialog = page.getByRole("dialog", { name: /Köttfärssås/ });
  await expect(detailDialog.getByRole("button", { name: "Radera recept" })).toHaveCount(0);
  await detailDialog.getByRole("button", { name: "Redigera recept" }).click();

  const formDialog = page.getByRole("dialog", { name: "Redigera recept" });
  await formDialog.getByRole("button", { name: "Radera recept" }).click();
  await formDialog.getByRole("button", { name: "Bekräfta radering av receptet" }).click();

  expect(deleteCalled).toBe(true);
  await expect(page.getByText("Köttfärssås")).toHaveCount(0);
});

// removeRecipe väntade tidigare INTE in DELETE-svaret innan den tog bort
// receptet lokalt (fire-and-glöm) — ett misslyckat anrop kunde alltså se ut
// som en lyckad radering (receptet försvann direkt), för att sedan dyka upp
// igen vid nästa hämtning. Verifierar att ett misslyckat anrop nu lämnar
// receptet kvar synligt, med serverns riktiga felmeddelande i bannern.
test("Recept: ett misslyckat DELETE-anrop tar INTE bort receptet lokalt, visar serverns felmeddelande", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, [RECIPE]);
  await page.route("**/api/recipes/recipe-1", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    route.fulfill({ status: 403, json: { error: "Åtkomst nekad" } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();
  await page.getByRole("dialog", { name: /Köttfärssås/ }).getByRole("button", { name: "Redigera recept" }).click();

  const formDialog = page.getByRole("dialog", { name: "Redigera recept" });
  await formDialog.getByRole("button", { name: "Radera recept" }).click();
  await formDialog.getByRole("button", { name: "Bekräfta radering av receptet" }).click();

  // onDelete stänger båda modalerna direkt oavsett utfall (samma synkrona
  // mönster som innan) — bara den lokala listborttagningen väntar in svaret.
  await expect(page.getByRole("alert")).toContainText("Åtkomst nekad");
  await expect(page.getByText("Köttfärssås")).toBeVisible();
});

// Felbannern visar numera serverns RIKTIGA felmeddelande direkt (client.ts:s
// performRequest/handleResponse), inte en egen generisk text i
// useRecipesState.ts — den senare skrev tidigare över den riktiga orsaken
// (bannern är en enda apiError-sträng, useAppState.ts), vilket gömde exakt
// den information Zaida behövde när hon rapporterade "det fungerar inte att
// radera/spara recept" (2026-07-26).
test("Recept: spara-fel visar serverns riktiga felmeddelande i felbannern, inte tystnas", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, []);
  await page.route("**/api/recipes", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    return route.fulfill({ status: 500, json: { error: "Serverfel" } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Nytt recept" }).click();
  await page.getByPlaceholder("Till exempel Köttfärssås").fill("Trasigt recept");
  await page.getByPlaceholder("Till exempel 2 dl mjöl").fill("Något");
  await page.getByPlaceholder("Till exempel Blanda mjöl och mjölk").fill("Ett steg");
  await page.getByRole("button", { name: "Skapa recept" }).click();

  await expect(page.getByRole("alert")).toContainText("Serverfel");
});
