import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Sprint 5 S1: addItem/updateItem/removeItem/updateSettings i rewardShopService.ts
// saknade broadcastRewardShopChanged() — en katalogändring på en annan enhet syntes
// aldrig här förrän man manuellt laddade om sidan. Fixat i backend (broadcast läggs
// till) och frontend (useRewardShopState.ts hämtade tidigare bara om den köpta
// listan vid ett SSE-event, inte själva katalogen).

const ITEM_A = {
  id: "rsi-a", title: "Biobiljett", symbol: "🎬", starCost: 20, timerMinutes: null,
  availability: null, requiredCategories: [], createdBy: "mem-1", deletedAt: null,
};

const ITEM_B = {
  id: "rsi-b", title: "Extra godnattsaga", symbol: "📖", starCost: 5, timerMinutes: null,
  availability: null, requiredCategories: [], createdBy: "mem-1", deletedAt: null,
};

test("Belöningsbutikens katalog synkas via SSE — en ny vara på en annan enhet dyker upp utan omladdning", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );

  let getShopCalls = 0;
  await page.route(/\/api\/reward-shop$/, (route) => {
    getShopCalls++;
    const items = getShopCalls === 1 ? [ITEM_A] : [ITEM_A, ITEM_B];
    return route.fulfill({ json: { items, requireApprovalForCategories: false } });
  });

  // Simulerar en katalogändring gjord på en annan enhet: eventströmmen levererar
  // "connected" (hoppas över, hanteras redan av den initiala hämtningen) och sedan
  // ett enda reward-shop-changed i samma svar.
  await page.route("**/api/reward-shop/events", (route) =>
    route.fulfill({
      headers: { "content-type": "text/event-stream" },
      body: "event: connected\ndata: {}\n\nevent: reward-shop-changed\ndata: {}\n\n",
    })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "🏪 Belöningsbutiken" }).click();
  await expect(page.getByText("Biobiljett", { exact: true })).toBeVisible();

  await expect(page.getByText("Extra godnattsaga", { exact: true })).toBeVisible();
});
