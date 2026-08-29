import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// 2026-08-29, Zaidas önskemål: "när jag uppdaterar sidan skall jag hållas
// kvar på den vy jag är på" — Hem-vyns interna flikval (Kalender/Inköp/
// Todos/Måltidsplan/Medlemmar, MemberOverview.tsx) var tidigare ren lokal
// useState utan URL-koppling, till skillnad från toppnivå-panelerna och
// Inställningars kategori/underkategori (se browser-history-
// navigation.spec.ts). Se useHomeTabNavSync.ts.

test.describe("Hem-vyns flikval överlever en sidladdning", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndData(page);
  });

  test("en sidladdning på Todos-fliken håller kvar Todos-fliken, inte Kalender", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "Visa kalender" })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: "Visa todos" }).click();
    await expect(page).toHaveURL(/\/\?tab=todos$/);
    await expect(page.getByRole("tab", { name: "Visa todos" })).toHaveAttribute("aria-selected", "true");

    await page.reload();
    await expect(page.getByRole("tab", { name: "Visa todos" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#home-panel-todos")).toBeVisible();
  });

  test("Kalender-fliken (standard) skriver ingen ?tab=-parameter", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Visa inköpslista" }).click();
    await expect(page).toHaveURL(/\/\?tab=shopping$/);

    await page.getByRole("tab", { name: "Visa kalender" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("bakåt-knappen växlar tillbaka till föregående Hem-flik utan att lämna Hem-panelen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Visa todos" }).click();
    await expect(page).toHaveURL(/\/\?tab=todos$/);

    await page.getByRole("tab", { name: "Visa inköpslista" }).click();
    await expect(page).toHaveURL(/\/\?tab=shopping$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/\?tab=todos$/);
    await expect(page.getByRole("tab", { name: "Visa todos" })).toHaveAttribute("aria-selected", "true");
  });
});
