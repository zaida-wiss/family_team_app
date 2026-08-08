import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Rökprov för Inställningar-panelen. Skriven efter produktionsincidenten 2026-07-03
// (docs/engineering-os/08-documentation/records/incidents/2026-07-03-installningar-fryser.md)
// där panelen kraschade helt vid öppning — inget befintligt test öppnade den innan dess.

const PURCHASED_REWARD = (id: string) => ({
  id,
  accountId: "acc-1",
  memberId: "mem-2",
  itemTitle: "Extra skärmtid",
  itemSymbol: "🎮",
  starCost: 5,
  purchasedAt: new Date().toISOString(),
  startsAt: new Date().toISOString(),
  durationMinutes: 30,
  deletedAt: null,
});

test.describe("Inställningar", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndData(page);
    // Ersätter mockDataAPIs generella tomma /purchased-svar med realistisk data —
    // krascher i det verkliga renderingsflödet (mappning över köpta belöningar) syns
    // bara om listan faktiskt har innehåll, inte med total:0.
    await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
    await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
      route.fulfill({
        json: {
          items: [PURCHASED_REWARD("pr-1"), PURCHASED_REWARD("pr-2")],
          page: 1,
          pageSize: 25,
          total: 2,
        },
      })
    );
  });

  test("öppnar utan att krascha och visar köpta belöningar", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Barn", exact: true }).click();
    await page.getByRole("button", { name: "🏪 Belöningsbutiken" }).click();

    await expect(page.getByText("Belöningsbutiken", { exact: true })).toBeVisible();
    await expect(page.getByText("Uthämtade belöningar", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ta bort Extra skärmtid/ }).first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  // 2026-07-26, Zaidas önskemål: "trycker jag på inställningar-ikonen när
  // jag är på en gren inne i inställningar så skall jag komma tillbaka till
  // inställningsmenyn". activePanel byter inte värde (redan "settings"), så
  // ett naivt onClick={() => onNavigate("settings")} gjorde ingenting —
  // fixat med en egen panelNavResetKey-räknare (useAppState.ts, generaliserad
  // 2026-08-09 till alla nav-ikoner) som tvingar panelen att ommonteras vid
  // VARJE klick på ikonen.
  test("klick på Inställningar-ikonen mitt i en underkategori går tillbaka till kategori-rutnätet", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[title="Inställningar"]').click();
    await page.getByRole("button", { name: "Barn", exact: true }).click();
    await page.getByRole("button", { name: "🏪 Belöningsbutiken" }).click();
    await expect(page.getByText("Belöningsbutiken", { exact: true })).toBeVisible();

    // Samma huvudnav-ikon igen, mitt i underkategorin — inte brödsmulan.
    await page.locator('button[title="Inställningar"]').click();

    await expect(page.getByRole("button", { name: "Barn", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Utseende" })).toBeVisible();
    await expect(page.getByText("Belöningsbutiken", { exact: true })).toHaveCount(0);
  });

  // 2026-07-26, Zaidas önskemål: "i redigera todolistor ska vi även via ett
  // reglage kunna bestämma avståndet vågrät mellan kategoritrådarna".
  // 2026-08-10, Zaidas önskemål: gjort enhetslokalt (localStorage, se
  // useDeviceSetting.ts) — testet skrevs tidigare mot den gamla,
  // kontosynkade PATCH-varianten och failade tyst i CI efter omläggningen
  // (savedGap blev aldrig satt eftersom inget PATCH-anrop längre görs för
  // detta fält). Kollar nu localStorage-nyckeln direkt istället.
  test("reglaget för avstånd mellan kategoritrådarna sparar ett nytt värde", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Utseende" }).click();

    const slider = page.getByLabel(/Avstånd mellan kategoritrådarna/);
    await expect(slider).toBeVisible();
    await slider.fill("20");

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("device-setting:todoThreadGap")))
      .toBe("20");
    await expect(
      page.getByText("Avstånd mellan kategoritrådarna (20 px, bara på den här enheten)")
    ).toBeVisible();
  });

  // 2026-07-27, Zaidas önskemål: "man måste även kunna bestämma storlek på
  // bubbelsysslornas bubblor under utseende, inte bara avståndet" — samma
  // reglage-mönster som avstånds-slidern ovan, samma 2026-08-10-omläggning
  // till localStorage (se kommentaren på testet ovan).
  test("reglaget för bubblornas storlek sparar ett nytt värde", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Utseende" }).click();

    const slider = page.getByLabel(/Bubblornas storlek/);
    await expect(slider).toBeVisible();
    await slider.fill("140");

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("device-setting:todoBubbleSize")))
      .toBe("140");
    await expect(
      page.getByText("Bubblornas storlek (140 px, bara på den här enheten)")
    ).toBeVisible();
  });
});
