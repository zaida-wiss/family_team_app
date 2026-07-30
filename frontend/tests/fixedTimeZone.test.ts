import { describe, test, expect } from "vitest";
import {
  timeToAnchorISO,
  isoToTimeInput,
  withWallClockOnDate,
  isoToLocalDateTimeStr,
  localDateTimeToISO,
} from "../src/utils/fixedTimeZone";

describe("fixedTimeZone", () => {
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

  // Kalenderhändelser (2026-07-30, Account.fixedCalendarTimes) — en HELT EGEN
  // inställning från fixedTodoTimes ovan, men samma underliggande primitiver.
  // Till skillnad från todos har kalenderhändelser ett RIKTIGT datum (inte
  // bara ett klockslag på en fast ankardag), så dessa funktioner rundtrippar
  // hela "YYYY-MM-DDTHH:MM"-strängen som ett <input type="datetime-local"> ger.
  test("localDateTimeToISO/isoToLocalDateTimeStr: fixed=false rundtrippar i körmiljöns egen tidszon", () => {
    const iso = localDateTimeToISO("2026-07-20T10:00", false);
    expect(isoToLocalDateTimeStr(iso, false)).toBe("2026-07-20T10:00");
  });

  test("localDateTimeToISO/isoToLocalDateTimeStr: fixed=true ger alltid samma datum+klockslag tillbaka, oavsett körmiljöns tidszon", () => {
    const iso = localDateTimeToISO("2026-07-20T10:00", true);
    expect(isoToLocalDateTimeStr(iso, true)).toBe("2026-07-20T10:00");
  });

  test("localDateTimeToISO: fixed=true kodar mot Sveriges faktiska UTC-offset (sommartid CEST/UTC+2 i juli)", () => {
    const iso = localDateTimeToISO("2026-07-20T10:00", true);
    expect(new Date(iso).getUTCHours()).toBe(8);
    expect(new Date(iso).getUTCMinutes()).toBe(0);
  });

  test("localDateTimeToISO: fixed=true kodar mot vintertid (CET/UTC+1) för ett datum i januari", () => {
    const iso = localDateTimeToISO("2026-01-20T10:00", true);
    expect(new Date(iso).getUTCHours()).toBe(9);
  });
});
