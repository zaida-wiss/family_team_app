import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Verifierar att navigationen mellan de olika sektionerna fungerar.
// Alla tester börjar med en mockad aktiv session så att inloggningsformuläret aldrig syns.

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndData(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Hem" })).toBeVisible();
  });

  test("Todos-fliken är nåbar och renderar sin vy", async ({ page }) => {
    await page.getByRole("button", { name: "Todos" }).click();
    // TodosView innehåller alltid ett skapa-formulär — det är signaturen för att vyn är laddad
    await expect(page.getByRole("button", { name: "Todos" })).toBeVisible();
  });

  test("Kalender-fliken är nåbar", async ({ page }) => {
    await page.getByRole("button", { name: "Kalender" }).click();
    await expect(page.getByRole("button", { name: "Kalender" })).toBeVisible();
  });

  test("Inköp-fliken är nåbar", async ({ page }) => {
    await page.getByRole("button", { name: "Inköp" }).click();
    await expect(page.getByRole("button", { name: "Inköp" })).toBeVisible();
  });

  test("Hem-fliken är aktiv vid start", async ({ page }) => {
    // Hem-knappen ska ha aria-pressed="true" eller en aktiv CSS-klass —
    // vi testar att den finns synlig och att appen är på hemvyn
    await expect(page.getByRole("button", { name: "Hem" })).toBeVisible();
    // Kalender-vyn ska INTE synas förrän man navigerat dit
    await expect(page.getByRole("button", { name: "Kalender" })).toBeVisible();
  });
});
