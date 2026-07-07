/**
 * Integrationstest (2026-07-07): mjuk-raderade PRENUMERERADE kalenderhändelser
 * togs aldrig bort ur calendar.events — bara datum-gamla gjorde det. Ett
 * käll-flöde vars UID:n inte matchade tidigare sparade (vid varje timmes synk,
 * se server.ts syncAllSubscriptions) fick då arrayen att växa obegränsat —
 * grundorsaken till upprepade minneskrascher i produktion (en kalender hade
 * vuxit till 11 000+ händelser, varav 11 000 redan mjuk-raderade spökposter).
 * pruneOldEvents tar nu bort mjuk-raderade prenumererade händelser omedelbart,
 * oavsett datum.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";
import { CalendarModel } from "../src/db/models/Calendar.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("calendarSubscriptionsService: mjuk-raderade prenumererade spökhändelser städas bort", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it("synk tar bort gamla mjuk-raderade prenumererade spökposter, men behåller aktiva och respekterar retention för manuella händelser", async () => {
    // Flödet innehåller fortfarande "active-1" — reconcileExistingEvents ska
    // hitta matchningen och uppdatera händelsen på plats (inte mjuk-radera
    // den) precis som vid en helt normal, oförändrad synk.
    const icsFeed = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:active-1",
      "SUMMARY:Aktiv prenumererad händelse",
      "DTSTART:20260627T100000Z",
      "DTEND:20260627T110000Z",
      "END:VEVENT",
      "END:VCALENDAR",
      ""
    ].join("\r\n");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(icsFeed, { status: 200 })));

    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "cal-prune-int@bmad.test", password: "Lösenord1!", name: "Städtest" });
    const accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Städfamiljen" });
    const memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const calendarId = `calendar-prune-${crypto.randomUUID()}`;
    const createCalendar = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: calendarId, name: "Skolan", color: "#000000", ownerId: memberId,
        sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false
      });
    expect(createCalendar.status).toBe(201);

    const createSub = await request(app)
      .post(`/api/calendars/${calendarId}/subscriptions`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ url: "https://example.com/skolan.ics" });
    const subId = (createSub.body as { id: string }).id;

    // createSubscription triggar en egen fire-and-forget synk (medvetet
    // oinväntad i källkoden) — väntar in den så den hinner skapa "active-1"
    // från det mockade flödet innan vi manipulerar arrayen direkt nedan.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Manipulerar databasen direkt för att sätta upp den trasiga tillståndet
    // (spökposter) som annars hade tagit veckor av riktiga hourly-synkar att
    // återskapa — samma read/write-mot-produktion-försiktighet gäller INTE
    // här eftersom detta är ett isolerat testkonto, inte produktionsdata.
    const now = new Date();
    const tooOldManual = new Date(now); tooOldManual.setMonth(tooOldManual.getMonth() - 2);
    const recentManual = new Date(now); recentManual.setDate(recentManual.getDate() - 10);

    await CalendarModel.updateOne(
      { id: calendarId },
      {
        $push: {
          events: {
            $each: [
              // Prenumererad, mjuk-raderad, väl inom 3-månadersfönstret — SKA
              // ändå tas bort direkt (det är hela poängen med fixen).
              {
                id: "event-ghost-1", calendarId, title: "Spökhändelse", startsAt: recentManual.toISOString(),
                endsAt: recentManual.toISOString(), isAllDay: false, color: null, uid: "ghost-1",
                subscriptionId: subId, location: null, notes: null,
                recurrence: { type: "none", interval: 1, until: null }, attendees: [],
                createdBy: memberId, deletedAt: now.toISOString(), deletedBy: null
              },
              // Manuell (ingen subscriptionId), mjuk-raderad men FÖR GAMMAL
              // (utanför 1-månadersfönstret) — ska tas bort, men av den
              // BEFINTLIGA datum-baserade regeln, inte den nya.
              {
                id: "event-old-manual", calendarId, title: "Gammal manuell händelse", startsAt: tooOldManual.toISOString(),
                endsAt: tooOldManual.toISOString(), isAllDay: false, color: null, uid: null,
                subscriptionId: null, location: null, notes: null,
                recurrence: { type: "none", interval: 1, until: null }, attendees: [],
                createdBy: memberId, deletedAt: now.toISOString(), deletedBy: null
              },
              // Manuell, mjuk-raderad, INOM 1-månadersfönstret — ska finnas
              // kvar (oförändrat beteende för manuella händelser).
              {
                id: "event-recent-manual", calendarId, title: "Nyligen raderad manuell händelse", startsAt: recentManual.toISOString(),
                endsAt: recentManual.toISOString(), isAllDay: false, color: null, uid: null,
                subscriptionId: null, location: null, notes: null,
                recurrence: { type: "none", interval: 1, until: null }, attendees: [],
                createdBy: memberId, deletedAt: now.toISOString(), deletedBy: null
              }
            ]
          }
        }
      }
    );

    const beforeSync = await CalendarModel.findOne({ id: calendarId }).lean();
    const activeSubEvent = ((beforeSync as any)?.events ?? []).find((e: { uid: string }) => e.uid === "active-1");
    expect(activeSubEvent).toBeTruthy();

    const sync = await request(app)
      .post(`/api/calendars/${calendarId}/subscriptions/${subId}/sync`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(sync.status).toBe(200);

    const after = await CalendarModel.findOne({ id: calendarId }).lean();
    const events = (after as any)?.events ?? [];
    const eventIds = events.map((e: { id: string }) => e.id);
    const uids = events.map((e: { uid: string | null }) => e.uid);

    expect(eventIds).not.toContain("event-ghost-1");
    expect(uids).toContain("active-1");
    expect(eventIds).not.toContain("event-old-manual");
    expect(eventIds).toContain("event-recent-manual");
  });
});
