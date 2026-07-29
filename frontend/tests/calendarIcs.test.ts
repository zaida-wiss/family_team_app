import { describe, expect, it } from "vitest";
import { toIcs, toIcsMerged } from "../src/features/calendars/calendarIcs";
import type { Calendar, CalendarEvent } from "@shared/types";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1", calendarId: "cal-1", title: "Tandläkare",
    startsAt: "2026-08-01T10:00:00.000Z", endsAt: "2026-08-01T11:00:00.000Z",
    isAllDay: false, color: null, uid: null, subscriptionId: null, location: null,
    notes: null, recurrence: { type: "none", interval: 1, until: null }, attendees: [],
    symbol: null, createdBy: "mem-1", deletedAt: null, deletedBy: null,
    ...overrides
  };
}

function calendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: "cal-1", name: "Min kalender", color: "#ffffff", ownerId: "mem-1", sharedWith: [],
    events: [event()], importedSources: [], subscriptions: [], calDavConnections: [],
    deletedAt: null, deletedBy: null,
    ...overrides
  };
}

// Utökad export (2026-07-29, del av Zaidas önskemål "all data ska gå att
// importera och exportera i de olika kategorierna i inställningar") —
// toIcsMerged slår ihop flera kalendrar till en fil, taggar varje händelse
// med sin ursprungskalenders namn (CATEGORIES).

describe("toIcs", () => {
  it("bygger en giltig VCALENDAR med en händelse, hoppar över raderade", () => {
    const cal = calendar({ events: [event(), event({ id: "event-2", deletedAt: "2026-01-01T00:00:00.000Z" })] });
    const ics = toIcs(cal);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("SUMMARY:Tandläkare");
    expect(ics).not.toContain("CATEGORIES:");
  });
});

describe("toIcsMerged", () => {
  it("slår ihop flera kalendrar till en fil, taggar varje händelse med ursprungskalenderns namn", () => {
    const calA = calendar({ id: "cal-a", name: "Jobb", events: [event({ id: "e1", title: "Möte" })] });
    const calB = calendar({ id: "cal-b", name: "Fritid", events: [event({ id: "e2", title: "Match" })] });
    const ics = toIcsMerged([calA, calB], "Mina kalendrar");

    expect(ics).toContain("X-WR-CALNAME:Mina kalendrar");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Möte");
    expect(ics).toContain("CATEGORIES:Jobb");
    expect(ics).toContain("SUMMARY:Match");
    expect(ics).toContain("CATEGORIES:Fritid");
  });

  it("hoppar över raderade händelser i varje kalender", () => {
    const calA = calendar({ events: [event({ deletedAt: "2026-01-01T00:00:00.000Z" })] });
    const ics = toIcsMerged([calA], "Mina kalendrar");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
