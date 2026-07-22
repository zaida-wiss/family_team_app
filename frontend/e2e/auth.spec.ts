import { test, expect } from "@playwright/test";
import { mockUnauthenticated, mockAuthAndData, mockDataAPIs, loginViaUI } from "./helpers";

test.describe("Inloggningsformulär", () => {
  test("visas när ingen aktiv session finns", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "BMAD" })).toBeVisible();
    await expect(page.getByLabel("E-postadress")).toBeVisible();
    await expect(page.getByLabel("Lösenord")).toBeVisible();
    await expect(page.getByRole("button", { name: "Logga in", exact: true })).toBeVisible();
  });

  test("visar felmeddelande vid felaktiga uppgifter", async ({ page }) => {
    await mockUnauthenticated(page);
    // client.ts kastar alltid "Inte autentiserad" vid 401 — JSON-kroppen används inte
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ status: 401, json: { error: "Fel e-postadress eller lösenord" } })
    );
    await page.goto("/");
    await page.getByLabel("E-postadress").fill("fel@exempel.se");
    await page.getByLabel("Lösenord").fill("feltlösenord");
    await page.getByRole("button", { name: "Logga in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Inte autentiserad");
  });

  test("visar dashboarden efter lyckad inloggning", async ({ page }) => {
    // Steg 1: refresh → 401 (inloggningsformuläret visas)
    await mockUnauthenticated(page);
    // Steg 2: data-API:er mock:as (används efter inloggning)
    await mockDataAPIs(page);
    await page.goto("/");
    // Steg 3: fyll i formuläret — loginViaUI mock:ar POST /api/auth/login
    await loginViaUI(page);
    await expect(page.getByRole("button", { name: "Hem" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Todos" })).toBeVisible();
  });

  test("kan växla till registreringsformuläret", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Inget konto/ }).click();
    await expect(page.getByLabel("Namn")).toBeVisible();
    await expect(page.getByRole("button", { name: "Skapa konto" })).toBeVisible();
  });

  test("återställningsflödet visar rätt rubrik", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Glömt lösenordet?" }).click();
    await expect(page.getByRole("button", { name: "Skicka återställningslänk" })).toBeVisible();
  });
});

test.describe("Aktiv session vid sidladdning", () => {
  test("hoppar direkt till dashboarden utan inloggningsformulär", async ({ page }) => {
    await mockAuthAndData(page);
    await page.goto("/");
    await expect(page.getByLabel("E-postadress")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Hem" })).toBeVisible();
  });
});
