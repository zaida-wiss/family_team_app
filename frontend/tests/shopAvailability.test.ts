import { describe, expect, it } from "vitest";
import { isAvailableNow, minutesUntilAvailable, unavailableLabel } from "../src/features/rewards/shopAvailability";
import type { RewardShopItem, ShopAvailability, ShopAvailabilityWindow } from "@shared/types";

// Konstruerade via Date.UTC + mitt på dagen (inte lokal midnatt) så testet ger
// samma resultat oavsett vilken tidszon testkörningsmaskinen själv har —
// isAvailableNow utvärderar sedan 2026-08-28 alltid i Europe/Stockholm
// (se shared/rewardShopAvailability.ts), inte i processens egen lokala tid.
const SATURDAY = new Date(Date.UTC(2026, 7, 29, 12, 0, 0)); // lördag 2026-08-29, 14:00 i Stockholm
const MONDAY = new Date(Date.UTC(2026, 7, 31, 12, 0, 0)); // måndag 2026-08-31, 14:00 i Stockholm

function window(overrides: Partial<ShopAvailabilityWindow> = {}): ShopAvailabilityWindow {
  return { daysOfWeek: [], timeIntervals: [], ...overrides };
}

function availability(overrides: Partial<ShopAvailability> = {}): ShopAvailability {
  return { startDate: null, endDate: null, windows: [], ...overrides };
}

function item(overrides: Partial<RewardShopItem> = {}): RewardShopItem {
  return {
    id: "reward-1",
    title: "Extra godis",
    symbol: "🍬",
    starCost: 10,
    timerMinutes: null,
    availability: null,
    purchaseLimit: null,
    requiredCategories: [],
    createdBy: "mem-1",
    deletedAt: null,
    ...overrides
  };
}

describe("veckodagsfiltrering", () => {
  it("är tillgänglig utan fönster satta (tom lista = alla dagar/tider)", () => {
    const i = item({ availability: availability() });
    expect(isAvailableNow(i, MONDAY)).toBe(true);
    expect(isAvailableNow(i, SATURDAY)).toBe(true);
  });

  it("är bara tillgänglig på valda veckodagar i fönstret", () => {
    const i = item({ availability: availability({ windows: [window({ daysOfWeek: ["saturday", "sunday"] })] }) });
    expect(isAvailableNow(i, SATURDAY)).toBe(true);
    expect(isAvailableNow(i, MONDAY)).toBe(false);
  });

  it("unavailableLabel listar tillåtna veckodagar i måndag-till-söndag-ordning", () => {
    const i = item({ availability: availability({ windows: [window({ daysOfWeek: ["sunday", "saturday"] })] }) });
    expect(unavailableLabel(i, MONDAY)).toBe("Tillgänglig: lör, sön");
  });

  it("kombineras med tidsintervall — fel veckodag blockerar även inom ett annars giltigt tidsintervall", () => {
    const i = item({
      availability: availability({
        windows: [window({ daysOfWeek: ["saturday"], timeIntervals: [{ start: "00:00", end: "23:59" }] })]
      })
    });
    expect(isAvailableNow(i, MONDAY)).toBe(false);
    expect(isAvailableNow(i, SATURDAY)).toBe(true);
  });

  it("minutesUntilAvailable ger null vid veckodagsspärr (ingen enkel nedräkning)", () => {
    const i = item({ availability: availability({ windows: [window({ daysOfWeek: ["saturday"] })] }) });
    expect(minutesUntilAvailable(i, MONDAY)).toBeNull();
  });
});

describe("flera fönster (olika tider för olika dagar)", () => {
  it("två fönster med olika dagar och tider — var och en gäller bara sin egen dag", () => {
    const i = item({
      availability: availability({
        windows: [
          window({ daysOfWeek: ["monday"], timeIntervals: [{ start: "15:00", end: "17:00" }] }),
          window({ daysOfWeek: ["saturday"], timeIntervals: [{ start: "10:00", end: "12:00" }] }),
        ]
      })
    });
    const mondayAt16 = new Date(Date.UTC(2026, 7, 31, 14, 0, 0)); // måndag 16:00 i Stockholm
    const mondayAt11 = new Date(Date.UTC(2026, 7, 31, 9, 0, 0)); // måndag 11:00 i Stockholm — utanför fönstret
    const saturdayAt11 = new Date(Date.UTC(2026, 7, 29, 9, 0, 0)); // lördag 11:00 i Stockholm

    expect(isAvailableNow(i, mondayAt16)).toBe(true);
    expect(isAvailableNow(i, mondayAt11)).toBe(false);
    expect(isAvailableNow(i, saturdayAt11)).toBe(true);
  });

  it("unavailableLabel visar imorgondagens EGNA tid, inte dagens", () => {
    const i = item({
      availability: availability({
        windows: [
          window({ daysOfWeek: ["monday"], timeIntervals: [{ start: "08:00", end: "09:00" }] }),
          window({ daysOfWeek: ["tuesday"], timeIntervals: [{ start: "18:00", end: "19:00" }] }),
        ]
      })
    });
    // Måndag 20:00 i Stockholm — dagens intervall (08-09) redan passerat
    const mondayEvening = new Date(Date.UTC(2026, 7, 31, 18, 0, 0));
    expect(unavailableLabel(i, mondayEvening)).toBe("Tillgänglig kl 18:00 imorgon");
  });
});
