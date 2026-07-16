import { describe, test, expect } from "vitest";
import { timeToAnchorISO, isoToTimeInput, withWallClockOnDate } from "../src/utils/todoTimeZone";

describe("todoTimeZone", () => {
  test("fixedTodoTimes=false (standard): läses tillbaka i det tidszon koden själv körs i", () => {
    const iso = timeToAnchorISO("10:00", false);
    expect(isoToTimeInput(iso, false)).toBe("10:00");
  });

  test("fixedTodoTimes=true: 10:00 kodas alltid mot Europe/Stockholm, oavsett var det senare läses", () => {
    const iso = timeToAnchorISO("10:00", true);
    // Läsning med fixedTodoTimes=true ska alltid ge tillbaka 10:00 — testets
    // egen körmiljö må vara vilken tidszon som helst.
    expect(isoToTimeInput(iso, true)).toBe("10:00");
  });

  test("fixedTodoTimes=true kodar mot Sveriges faktiska UTC-offset för ankardatumet (2000-01-01, vintertid CET/UTC+1)", () => {
    const iso = timeToAnchorISO("10:00", true);
    // Ankardatumet är alltid 1 januari (vintertid i Sverige, CET/UTC+1) —
    // samma vintertids-antagande som den ursprungliga (icke tidszon-medvetna)
    // implementationen redan hade, oförändrat här.
    expect(new Date(iso!).getUTCHours()).toBe(9);
    expect(new Date(iso!).getUTCMinutes()).toBe(0);
  });

  test("withWallClockOnDate flyttar samma klockslag till en ny dag, fixedTodoTimes=true", () => {
    const templateIso = timeToAnchorISO("10:00", true);
    const occurrenceIso = withWallClockOnDate(templateIso, "2026-07-20", true);
    expect(isoToTimeInput(occurrenceIso, true)).toBe("10:00");
    expect(occurrenceIso.startsWith("2026-07-20")).toBe(true);
  });

  test("withWallClockOnDate: null-värde ger midnatt UTC på angivet datum", () => {
    expect(withWallClockOnDate(null, "2026-07-20")).toBe("2026-07-20T00:00:00.000Z");
  });

  test("isoToTimeInput: null-värde ger tom sträng", () => {
    expect(isoToTimeInput(null)).toBe("");
    expect(timeToAnchorISO("")).toBeNull();
  });
});
