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

    await expect(page.getByText("Belöningsbutiken", { exact: true })).toBeVisible();
    await expect(page.getByText("Uthämtade belöningar", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ta bort Extra skärmtid/ }).first()).toBeVisible();

    expect(errors).toEqual([]);
  });
});
