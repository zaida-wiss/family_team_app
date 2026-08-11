import { test, expect } from "@playwright/test";
import { mockUnauthenticated, mockAuthAndData, mockDataAPIs, loginViaUI } from "./helpers";

// Personligt konto vid registrering (2026-08-10, se ADR-0032) — registrering
// skapar nu automatiskt ett minimalt "Personligt konto" (type: "personal",
// en enda "Ägare"-roll) istället för att lämna användaren på "Kom igång"-
// skärmen. Fixturen speglar det nya /api/auth/register-svarskontraktet
// (samma form som login: {accessToken, user, memberships}).
const REGISTER_ACCOUNT = { id: "acc-personal-1", name: "Personligt konto", type: "personal", createdBy: "mem-personal-1", deletedAt: null };
const REGISTER_MEMBER = {
  id: "mem-personal-1", accountId: "acc-personal-1", userId: "user-personal-1",
  name: "Ny Användare", roleId: "role-personal-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const REGISTER_RESPONSE = {
  accessToken: "fake-register-token",
  user: { id: "user-personal-1", email: "ny@exempel.se", name: "Ny Användare", createdAt: "2026-08-10T00:00:00.000Z" },
  memberships: [{ member: REGISTER_MEMBER, account: REGISTER_ACCOUNT }],
};

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
    await expect(page.getByRole("button", { name: "Todos", exact: true })).toBeVisible();
  });

  test("kan växla till registreringsformuläret", async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Inget konto/ }).click();
    await expect(page.getByLabel("Namn")).toBeVisible();
    await expect(page.getByRole("button", { name: "Skapa konto" })).toBeVisible();
  });

  test("registrering skapar automatiskt ett personligt konto och hoppar förbi Kom igång-skärmen", async ({ page }) => {
    await mockUnauthenticated(page);
    await mockDataAPIs(page);
    await page.route("**/api/auth/register", (route) =>
      route.fulfill({ status: 201, json: REGISTER_RESPONSE })
    );
    await page.goto("/");
    await page.getByRole("button", { name: /Inget konto/ }).click();
    await page.getByLabel("Namn").fill("Ny Användare");
    await page.getByLabel("E-postadress").fill("ny@exempel.se");
    await page.getByLabel("Lösenord").fill("lösenord123");
    await page.getByRole("button", { name: "Skapa konto" }).click();

    // Landar direkt i appen med det automatiskt skapade personliga kontot —
    // "Kom igång"/AccountPicker-skärmen visas aldrig.
    await expect(page.getByRole("button", { name: "Hem" })).toBeVisible();
    await expect(page.getByText("Kom igång")).not.toBeVisible();

    // Regression: att skapa en GRUPP (=familjekonto, dagens redan befintliga
    // "Skapa nytt familjekonto"-flöde) ska fortfarande fungera oförändrat,
    // som ett separat, uttryckligt steg via Inställningar → Konto → Byt vy
    // (2026-08-11, flyttad hit från en oskyltad ikon i sidonavet — se
    // HeroBar.tsx/family-switching.spec.ts för hela bakgrunden).
    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Konto" }).click();
    await page.getByRole("button", { name: "Byt vy" }).click();
    await expect(page.getByRole("button", { name: "Skapa nytt familjekonto" })).toBeVisible();
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
