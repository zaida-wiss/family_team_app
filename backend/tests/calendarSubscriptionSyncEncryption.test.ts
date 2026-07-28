import "dotenv/config";
import { describe, it, expect } from "vitest";
import { decryptField } from "../src/utils/fieldEncryption.js";
import {
  insertNewEvents,
  reconcileExistingEvents,
  parseIcsEvents
} from "../src/services/calendarSubscriptionsService.js";

// 2026-07-28-fynd: reconcileExistingEvents/insertNewEvents (ICS-prenumerationssynk,
// och sedan ADR-0027 återanvänt av Apple CalDAV-synken) skrev title/notes RAKT AV
// från det inlästa flödet — aldrig encryptField/encryptNullable. Varje synkad/
// importerad kalenderhändelse låg alltså i klartext, och blev omigrerad varje
// timme framåt eftersom synken skrev över den krypterade posten med ny klartext
// vid varje körning. Detta test verifierar direkt (utan MongoDB) att båda
// funktionerna nu krypterar innan de skriver till kalenderns events-array.

const ACCOUNT_ID = "acc-cal-sync-crypt";

describe("Kalendersynkens skrivningar krypteras (2026-07-28-fynd)", () => {
  it("insertNewEvents krypterar title/notes för en ny händelse", () => {
    const incoming = parseIcsEvents(
      [
        "BEGIN:VEVENT",
        "UID:event-abc",
        "SUMMARY:Läkarbesök hos dr Andersson",
        "DESCRIPTION:Konfidentiell anledning",
        "DTSTART:20260801T090000Z",
        "DTEND:20260801T100000Z",
        "END:VEVENT"
      ].join("\r\n")
    );
    expect(incoming).toHaveLength(1);

    const calendar = { events: [] as any[], ownerId: "mem-1" };
    insertNewEvents(calendar, "cal-1", "sub-1", incoming, ACCOUNT_ID);

    expect(calendar.events).toHaveLength(1);
    const stored = calendar.events[0];
    expect(stored.title).not.toBe("Läkarbesök hos dr Andersson");
    expect(stored.title.startsWith("v1:")).toBe(true);
    expect(decryptField(ACCOUNT_ID, stored.title)).toBe("Läkarbesök hos dr Andersson");

    expect(stored.notes).not.toBe("Konfidentiell anledning");
    expect(stored.notes.startsWith("v1:")).toBe(true);
    expect(decryptField(ACCOUNT_ID, stored.notes)).toBe("Konfidentiell anledning");
  });

  it("reconcileExistingEvents krypterar title/notes när en befintlig händelse uppdateras från flödet", () => {
    const calendar = {
      events: [
        {
          id: "event-1",
          uid: "event-abc",
          subscriptionId: "sub-1",
          startsAt: "2026-08-01T09:00:00.000Z",
          endsAt: "2026-08-01T10:00:00.000Z",
          isAllDay: false,
          title: "Gammal titel (redan krypterad från tidigare synk)",
          notes: null,
          deletedAt: null
        }
      ]
    };

    const incoming = parseIcsEvents(
      [
        "BEGIN:VEVENT",
        "UID:event-abc",
        "SUMMARY:Ny titel från flödet",
        "DESCRIPTION:Ny anteckning",
        "DTSTART:20260801T090000Z",
        "DTEND:20260801T100000Z",
        "END:VEVENT"
      ].join("\r\n")
    );
    const incomingByUid = new Map(incoming.filter((e) => e.uid).map((e) => [e.uid as string, e]));

    reconcileExistingEvents(calendar, "sub-1", incomingByUid, "2026-01-01", "2026-08-01T00:00:00.000Z", ACCOUNT_ID);

    const updated = calendar.events[0];
    expect(updated.title).not.toBe("Ny titel från flödet");
    expect(updated.title.startsWith("v1:")).toBe(true);
    expect(decryptField(ACCOUNT_ID, updated.title)).toBe("Ny titel från flödet");

    expect(updated.notes).not.toBe("Ny anteckning");
    expect(updated.notes.startsWith("v1:")).toBe(true);
    expect(decryptField(ACCOUNT_ID, updated.notes)).toBe("Ny anteckning");
  });
});
