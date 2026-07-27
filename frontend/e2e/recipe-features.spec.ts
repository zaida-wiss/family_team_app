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
  ingredients: [{ id: "ing-1", text: "köttfärs", quantity: 500, unit: "g" }],
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

// 2026-07-26, Zaidas fråga: "kan jag välja nu hur många personer jag ska
// tillaga för?" — en justerbar räknare i visa-vyn, SKILD från receptets
// egna sparade Antal personer (satt i redigera-formuläret). Ligger i samma
// localStorage-baserade cooking session som kryssrutorna/timern ovan.
test("Justerar antal personer just nu med +/- knapparna, oberoende av receptets sparade antal, överlever att man stänger och öppnar receptet igen", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, [RECIPE]);

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();

  const dialog = page.getByRole("dialog", { name: /Köttfärssås/ });
  await expect(dialog.getByText("4 personer")).toBeVisible();
  await expect(dialog.getByText("500 g köttfärs")).toBeVisible();
  await dialog.getByRole("button", { name: "Fler personer" }).click();
  await expect(dialog.getByText("5 personer")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Återställ till 4" })).toBeVisible();
  // Ingrediensmängden skalar direkt med räknaren (2026-07-26, Zaidas
  // önskemål: "sen måste vi fixa mängd och enheter").
  await expect(dialog.getByText("625 g köttfärs")).toBeVisible();

  await page.getByRole("button", { name: "Tillbaka" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();
  await expect(page.getByRole("dialog", { name: /Köttfärssås/ }).getByText("5 personer")).toBeVisible();
});

test("Ny ingrediens med mängd/enhet sparas strukturerat, en ingrediens utan mängd fungerar precis som förut", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, []);
  let createdBody: Record<string, unknown> | null = null;
  await page.route("**/api/recipes", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    createdBody = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { id: "recipe-new" } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Nytt recept" }).click();

  await page.getByPlaceholder("Till exempel Köttfärssås").fill("Omelett");
  await page.getByLabel("Mängd").first().fill("3");
  await page.getByLabel("Ingrediensnamn").first().fill("ägg");
  await page.getByRole("button", { name: "Lägg till ingrediens" }).click();
  await page.getByLabel("Mängd").nth(1).fill("1");
  await page.getByLabel("Enhet").nth(1).selectOption("dl");
  await page.getByLabel("Ingrediensnamn").nth(1).fill("mjölk");
  await page.getByRole("button", { name: "Lägg till ingrediens" }).click();
  await page.getByLabel("Ingrediensnamn").nth(2).fill("Salt efter smak");
  await page.getByPlaceholder("Till exempel Blanda mjöl och mjölk").fill("Vispa ihop");

  await page.getByRole("button", { name: "Skapa recept" }).click();

  await expect.poll(() => createdBody?.ingredients).toEqual([
    { text: "ägg", quantity: 3, unit: null },
    { text: "mjölk", quantity: 1, unit: "dl" },
    { text: "Salt efter smak", quantity: null, unit: null }
  ]);
});

test("Skapa uppgift-modalen förifylls med aktuellt antal personer, sparas i uppgiftens anteckningar", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, [RECIPE]);
  let createdBody: Record<string, unknown> | null = null;
  await page.route("**/api/todos", (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: [] });
    createdBody = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { id: "todo-new" } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();
  await page.getByRole("dialog", { name: /Köttfärssås/ }).getByRole("button", { name: "Skapa uppgift" }).click();

  const createDialog = page.getByRole("dialog", { name: "Skapa uppgift av Köttfärssås" });
  await expect(createDialog.getByLabel("Antal personer")).toHaveValue("4");
  await createDialog.locator('input[type="datetime-local"]').fill("2026-08-01T12:00");
  await createDialog.getByRole("button", { name: "Skapa" }).click();

  // 2026-07-27, Zaidas fråga: "är todo-kopian... uppdaterad med enheterna
  // och antal från receptet?" — anteckningarna innehåller nu även den
  // (vid behov skalade) ingredienslistan, inte bara antalet personer.
  await expect.poll(() => createdBody?.notes).toBe("Räknat för 4 personer.\n\nIngredienser:\n– 500 g köttfärs");
});

// 2026-07-27, Zaidas fynd: "visual value is required" när hon skapade en
// uppgift av ETT RECEPT UTAN EMOJI — Todo.visual.value är obligatoriskt
// (Mongoose required:true) och en tom sträng räknas som saknat värde.
// recipe.emoji ?? "" gav en tom sträng för recept utan ikon (ingen annan
// plats i appen skickar någonsin en tom sträng hit, alla andra faller
// tillbaka på en riktig standardemoji).
test("Skapa uppgift av ett recept UTAN emoji faller tillbaka på en standardsymbol, inte en tom sträng", async ({ page }) => {
  await mockAuthAndData(page);
  const recipeWithoutEmoji = { ...RECIPE, emoji: null };
  await mockRecipes(page, [recipeWithoutEmoji]);
  let createdBody: Record<string, unknown> | null = null;
  await page.route("**/api/todos", (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: [] });
    createdBody = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { id: "todo-new" } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();
  await page.getByRole("dialog", { name: /Köttfärssås/ }).getByRole("button", { name: "Skapa uppgift" }).click();

  const createDialog = page.getByRole("dialog", { name: "Skapa uppgift av Köttfärssås" });
  await createDialog.locator('input[type="datetime-local"]').fill("2026-08-01T12:00");
  await createDialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => (createdBody?.visual as { value?: string } | undefined)?.value).toBe("⭐");
});

test("Handlingslista-modalen förifylls med aktuellt antal personer och skalar mängderna som har mängd/enhet", async ({ page }) => {
  await mockAuthAndData(page);
  await mockRecipes(page, [RECIPE]);
  await page.route("**/api/shopping", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: [] }) : route.fulfill({ json: { ok: true } })
  );
  await page.route("**/api/shopping/*/items", (route) => route.fulfill({ json: { ok: true } }));

  await page.goto("/");
  await page.getByRole("button", { name: "Recept" }).click();
  await page.getByRole("button", { name: "Köttfärssås" }).click();
  await page.getByRole("dialog", { name: /Köttfärssås/ }).getByRole("button", { name: "Handlingslista" }).click();

  const shoppingDialog = page.getByRole("dialog", { name: "Handlingslista från Köttfärssås" });
  await expect(shoppingDialog.getByLabel("Antal personer")).toHaveValue("4");
  // Ändrar till 6 personer (receptet är sparat för 4) — mängden ska skalas.
  await shoppingDialog.getByLabel("Antal personer").fill("6");
  await shoppingDialog.getByRole("button", { name: "Lägg till" }).click();

  // Receptets egen visa-vy-modal (fullskärm sedan 2026-07-26) ligger kvar
  // öppen bakom handlingslista-modalen och fångar annars klicket på
  // huvudnavets Inköp-knapp.
  await page.getByRole("button", { name: "Tillbaka" }).click();
  await page.getByRole("button", { name: "Inköp" }).click();
  await expect(page.getByText("📐 Skalat från 4 till 6 personer")).toBeVisible();
  await expect(page.getByText("750 g köttfärs")).toBeVisible();
});
