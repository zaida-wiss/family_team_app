import { describe, expect, it } from "vitest";
import { isSamePurchasePeriod, toStockholmDateStr } from "@shared/rewardShopAvailability";

// Köpgränsräkningens periodjämförelse (RewardShopItem.purchaseLimit, 2026-08-29)
// — samma funktion körs server-side (rewardShopService.ts) för att avgöra om
// ett tidigare köp räknas mot dagens/veckans/månadens gräns.
describe("isSamePurchasePeriod", () => {
  it("day: bara exakt samma datum räknas", () => {
    expect(isSamePurchasePeriod("2026-08-29", "2026-08-29", "day")).toBe(true);
    expect(isSamePurchasePeriod("2026-08-28", "2026-08-29", "day")).toBe(false);
  });

  it("month: samma år-månad räknas, oavsett dag", () => {
    expect(isSamePurchasePeriod("2026-08-01", "2026-08-31", "month")).toBe(true);
    expect(isSamePurchasePeriod("2026-07-31", "2026-08-01", "month")).toBe(false);
  });

  it("week: måndag-till-söndag samma vecka räknas", () => {
    // Måndag 2026-08-31 till söndag 2026-09-06 är samma vecka
    expect(isSamePurchasePeriod("2026-08-31", "2026-09-06", "week")).toBe(true);
    // Söndag 2026-08-30 hör till FÖREGÅENDE vecka
    expect(isSamePurchasePeriod("2026-08-30", "2026-08-31", "week")).toBe(false);
  });
});

describe("toStockholmDateStr", () => {
  it("ger familjens lokala kalenderdatum, oavsett vilken tidszon Date-objektet konstrueras i", () => {
    // 2026-08-29 22:30 UTC är redan 2026-08-30 i Stockholm (sommartid, UTC+2)
    const lateUtc = new Date(Date.UTC(2026, 7, 29, 22, 30, 0));
    expect(toStockholmDateStr(lateUtc)).toBe("2026-08-30");
  });
});
