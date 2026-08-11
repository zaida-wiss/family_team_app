import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Verifierar webbläsarens bakåt/framåt-knappar (2026-08-11, Zaidas
// önskemål: "om jag i webbläsaren vill backa eller gå framåt så vill jag
// att det ska fungera") — se usePanelUrlSync.ts/navPaths.ts (toppnivå-
// paneler) och useSettingsNavSync.ts (Inställningars kategori/
// underkategori). Innan denna ändring fanns ingen koppling alls mellan
// navigering och window.history — ett bakåt-tryck lämnade appen helt
// istället för att gå till senast visade vy.

test.describe("Bakåt/framåt-navigering", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndData(page);
  });

  test("bakåt/framåt växlar mellan senast visade toppnivå-paneler", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Hem", exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");

    await page.getByRole("button", { name: "Kalender", exact: true }).click();
    await expect(page).toHaveURL(/\/calendar$/);

    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await expect(page).toHaveURL(/\/todos$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.getByRole("button", { name: "Kalender", exact: true })).toHaveClass(/active/);

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Hem", exact: true })).toHaveClass(/active/);

    await page.goForward();
    await expect(page).toHaveURL(/\/calendar$/);
    await expect(page.getByRole("button", { name: "Kalender", exact: true })).toHaveClass(/active/);
  });

  test("en direkt URL (djuplänk) visar rätt panel utan klick", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("button", { name: "Kalender", exact: true })).toHaveClass(/active/);
  });

  test("bakåt inom Inställningar går till senast visade kategori-nivå", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await page.getByRole("button", { name: "Familj", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/family$/);
    await expect(page.getByRole("button", { name: "Familjemedlemmar", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Familjemedlemmar", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/family\/members$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/family$/);
    await expect(page.getByRole("button", { name: "Familjemedlemmar", exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("button", { name: "Familj", exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Hem", exact: true })).toHaveClass(/active/);
  });
});
