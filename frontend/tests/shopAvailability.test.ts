import { describe, expect, it } from "vitest";
import { isAvailableNow, minutesUntilAvailable, unavailableLabel } from "../src/features/rewards/shopAvailability";
import type { RewardShopItem, ShopAvailability } from "@shared/types";

// Konstruerade via Date.UTC + mitt på dagen (inte lokal midnatt) så testet ger
// samma resultat oavsett vilken tidszon testkörningsmaskinen själv har —
// isAvailableNow utvärderar sedan 2026-08-28 alltid i Europe/Stockholm
// (se shared/rewardShopAvailability.ts), inte i processens egen lokala tid.
const SATURDAY = new Date(Date.UTC(2026, 7, 29, 12, 0, 0)); // lördag 2026-08-29, 14:00 i Stockholm
const MONDAY = new Date(Date.UTC(2026, 7, 31, 12, 0, 0)); // måndag 2026-08-31, 14:00 i Stockholm

function availability(overrides: Partial<ShopAvailability> = {}): ShopAvailability {
  return { startDate: null, endDate: null, daysOfWeek: [], timeIntervals: [], ...overrides };
}

function item(overrides: Partial<RewardShopItem> = {}): RewardShopItem {
  return {
    id: "reward-1",
    title: "Extra godis",
    symbol: "🍬",
    starCost: 10,
    timerMinutes: null,
    availability: null,
    requiredCategories: [],
    createdBy: "mem-1",
    deletedAt: null,
    ...overrides
  };
}

describe("veckodagsfiltrering", () => {
  it("är tillgänglig utan daysOfWeek satt (tom lista = alla dagar)", () => {
    const i = item({ availability: availability() });
    expect(isAvailableNow(i, MONDAY)).toBe(true);
    expect(isAvailableNow(i, SATURDAY)).toBe(true);
  });

  it("är bara tillgänglig på valda veckodagar", () => {
    const i = item({ availability: availability({ daysOfWeek: ["saturday", "sunday"] }) });
    expect(isAvailableNow(i, SATURDAY)).toBe(true);
    expect(isAvailableNow(i, MONDAY)).toBe(false);
  });

  it("unavailableLabel listar tillåtna veckodagar i måndag-till-söndag-ordning", () => {
    const i = item({ availability: availability({ daysOfWeek: ["sunday", "saturday"] }) });
    expect(unavailableLabel(i, MONDAY)).toBe("Tillgänglig: lör, sön");
  });

  it("kombineras med tidsintervall — fel veckodag blockerar även inom ett annars giltigt tidsintervall", () => {
    const i = item({
      availability: availability({ daysOfWeek: ["saturday"], timeIntervals: [{ start: "00:00", end: "23:59" }] })
    });
    expect(isAvailableNow(i, MONDAY)).toBe(false);
    expect(isAvailableNow(i, SATURDAY)).toBe(true);
  });

  it("minutesUntilAvailable ger null vid veckodagsspärr (ingen enkel nedräkning)", () => {
    const i = item({ availability: availability({ daysOfWeek: ["saturday"] }) });
    expect(minutesUntilAvailable(i, MONDAY)).toBeNull();
  });
});
