import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Födelsedagslista (2026-08-06, Zaidas önskemål): en lista över
// födelsedagar i Inställningar → Kalender (flyttad dit från Familj
// 2026-08-07, Zaidas rättelse — hör tematiskt närmare kalenderdatum),
// sorterad "vem fyller år näst" överst, delbar med anslutna familjer
// (ADR-0030, dataScope.birthdays).

test.describe("Födelsedagslista", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndData(page);
  });

  test("skapar en födelsedag, ser den i listan, redigerar och raderar den", async ({ page }) => {
    let birthdays: Array<{ id: string; name: string; month: number; day: number; year: number | null }> = [];

    await page.route("**/api/birthdays/connections", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/birthdays", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: birthdays });
      }
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        const entry = { id: "birthday-1", accountId: "acc-1", createdBy: "mem-1", deletedAt: null, deletedBy: null, ...body };
        birthdays = [...birthdays, entry];
        return route.fulfill({ status: 201, json: entry });
      }
      return route.continue();
    });
    await page.route("**/api/birthdays/birthday-1", (route) => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        birthdays = birthdays.map((b) => (b.id === "birthday-1" ? { ...b, ...body } : b));
        return route.fulfill({ json: { ok: true } });
      }
      if (route.request().method() === "DELETE") {
        birthdays = birthdays.filter((b) => b.id !== "birthday-1");
        return route.fulfill({ json: { ok: true } });
      }
      return route.continue();
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar" }).click();
    // Flyttad från Familj till Kalender (2026-08-07, Zaidas rättelse) — nu
    // TVÅ underkategorier under Kalender (Kalendrar + Födelsedagar), så
    // "hasSingleSub"-genvägen gäller inte längre, ett klick krävs på båda.
    // Scopat till kategori-rutnätet (samma mönster som calendar-export-all.
    // spec.ts) — appens bottennav har en egen, likadant namngiven
    // "Kalender"-knapp synlig samtidigt, exact:true räcker inte ensamt när
    // två OLIKA element har EXAKT samma tillgängliga namn.
    await page.locator(".settings-category-grid").getByRole("button", { name: "Kalender" }).click();
    await page.getByRole("button", { name: "🎂 Födelsedagar" }).click();

    await expect(page.getByText("Inga födelsedagar sparade än.")).toBeVisible();

    await page.getByRole("button", { name: "Ny födelsedag" }).click();
    await page.getByLabel("Namn").fill("Mormor");
    await page.getByLabel("Månad").selectOption("5");
    await page.getByLabel("Dag").fill("12");
    await page.getByLabel("År (valfritt)").fill("1958");
    await page.getByRole("button", { name: "Spara" }).click();

    await expect(page.getByText("Mormor")).toBeVisible();
    await expect(page.getByText(/12 Maj/)).toBeVisible();

    await page.getByRole("button", { name: "Redigera" }).click();
    await page.getByLabel("Namn").fill("Mormor Kerstin");
    await page.getByRole("button", { name: "Spara" }).click();
    await expect(page.getByText("Mormor Kerstin")).toBeVisible();

    await page.getByRole("button", { name: "Radera" }).click();
    await page.getByRole("button", { name: "Bekräfta" }).click();
    await expect(page.getByText("Inga födelsedagar sparade än.")).toBeVisible();
  });

  test("sorterar egna och delade födelsedagar tillsammans, närmast idag överst", async ({ page }) => {
    const today = new Date();
    const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
    const later = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);

    await page.route("**/api/birthdays", (route) =>
      route.fulfill({
        json: [
          { id: "b-later", accountId: "acc-1", name: "Egen (senare)", month: later.getMonth() + 1, day: later.getDate(), year: null, createdBy: "mem-1", deletedAt: null, deletedBy: null }
        ]
      })
    );
    await page.route("**/api/birthdays/connections", (route) =>
      route.fulfill({
        json: [
          {
            accountId: "acc-2",
            accountName: "Familj B",
            birthdays: [
              { id: "b-soon", accountId: "acc-2", name: "Delad (snart)", month: soon.getMonth() + 1, day: soon.getDate(), year: null, createdBy: "mem-x", deletedAt: null, deletedBy: null }
            ]
          }
        ]
      })
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar" }).click();
    // Flyttad från Familj till Kalender (2026-08-07, Zaidas rättelse) — nu
    // TVÅ underkategorier under Kalender (Kalendrar + Födelsedagar), så
    // "hasSingleSub"-genvägen gäller inte längre, ett klick krävs på båda.
    // Scopat till kategori-rutnätet (samma mönster som calendar-export-all.
    // spec.ts) — appens bottennav har en egen, likadant namngiven
    // "Kalender"-knapp synlig samtidigt, exact:true räcker inte ensamt när
    // två OLIKA element har EXAKT samma tillgängliga namn.
    await page.locator(".settings-category-grid").getByRole("button", { name: "Kalender" }).click();
    await page.getByRole("button", { name: "🎂 Födelsedagar" }).click();

    const rows = page.locator(".birthdays-settings__row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Delad (snart)");
    await expect(rows.nth(0)).toContainText("Familj B");
    await expect(rows.nth(1)).toContainText("Egen (senare)");
    // Den delade raden har ingen redigera/radera-knapp (bara läsbar).
    await expect(rows.nth(0).getByRole("button")).toHaveCount(0);
  });

  test("kryssrutan Födelsedagar finns i Familjeanslutningars scope-väljare", async ({ page }) => {
    await page.route("**/api/accounts/acc-1/family-connections/pending", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/accounts/acc-1/family-connections", (route) => route.fulfill({ json: { exposedByMe: [], exposedToMe: [] } }));

    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Familj", exact: true }).click();
    await page.getByRole("button", { name: "Familjeanslutningar" }).click();

    await expect(page.getByText("Anslut ditt konto till en annan familj")).toBeVisible();
    await page.getByLabel("E-post till en vuxen i den andra familjen").fill("mamma@exempel.se");
    await page.route("**/api/accounts/acc-1/family-connections/lookup**", (route) =>
      route.fulfill({ json: { accounts: [{ accountId: "acc-9", accountName: "Familj C" }] } })
    );
    await page.getByRole("button", { name: "Sök" }).click();

    await expect(page.getByText("Familj C")).toBeVisible();
    await expect(page.getByText("Födelsedagar", { exact: true })).toBeVisible();
  });
});
