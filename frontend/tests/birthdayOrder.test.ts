import { describe, it, expect } from "vitest";
import { daysUntilNextOccurrence, nextOccurrence, sortByUpcomingBirthday, turningAge } from "../src/features/settings/birthdayOrder";

const today = new Date(2026, 5, 15); // 2026-06-15

describe("daysUntilNextOccurrence", () => {
  it("räknar dagar fram till en födelsedag senare i år", () => {
    expect(daysUntilNextOccurrence(6, 20, today)).toBe(5);
  });

  it("räknar 0 om det är idag", () => {
    expect(daysUntilNextOccurrence(6, 15, today)).toBe(0);
  });

  it("hoppar till nästa år om datumet redan passerat i år", () => {
    // 2026-01-01 → nästa förekomst 2027-01-01, 200 dagar från 2026-06-15
    const next = nextOccurrence(1, 1, today);
    expect(next.getFullYear()).toBe(2027);
    expect(daysUntilNextOccurrence(1, 1, today)).toBeGreaterThan(0);
  });
});

describe("turningAge", () => {
  it("returnerar null utan angivet år", () => {
    expect(turningAge(null, 6, 20, today)).toBeNull();
  });

  it("räknar ut åldern vid nästa förekomst", () => {
    expect(turningAge(1990, 6, 20, today)).toBe(36);
  });

  it("räknar rätt ålder även när datumet redan passerat i år (nästa år)", () => {
    expect(turningAge(1990, 1, 1, today)).toBe(37);
  });
});

describe("sortByUpcomingBirthday", () => {
  it("sorterar närmast först, wrap-around till nästa år sist", () => {
    const items = [
      { name: "Sent i år", month: 12, day: 24 },
      { name: "Redan passerat", month: 1, day: 1 },
      { name: "Om 5 dagar", month: 6, day: 20 },
      { name: "Idag", month: 6, day: 15 }
    ];
    const sorted = sortByUpcomingBirthday(items, today);
    expect(sorted.map((i) => i.name)).toEqual(["Idag", "Om 5 dagar", "Sent i år", "Redan passerat"]);
  });

  it("bryter oavgjort på namn (alfabetiskt)", () => {
    const items = [
      { name: "Ödla", month: 6, day: 20 },
      { name: "Anna", month: 6, day: 20 }
    ];
    const sorted = sortByUpcomingBirthday(items, today);
    expect(sorted.map((i) => i.name)).toEqual(["Anna", "Ödla"]);
  });
});
