/**
 * Integrationstest (2026-07-15 buggfix): CalendarEventPatchSchema tillät
 * tidigare bara title/startsAt/endsAt/notes — symbol/location/isAllDay/
 * recurrence/attendees stripptes tyst av Zod och sparades aldrig, och ett
 * kalenderbyte via redigera-modalens dropdown gjorde ingenting alls
 * eftersom calendarId helt saknades i schemat. Verifierar att en PATCH nu
 * faktiskt persisterar dessa fält, samt att ett avvikande calendarId flyttar
 * händelsen till målkalenderns events-array.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("PATCH /api/calendars/:id/events/:eventId sparar alla redigerbara fält", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let calendarAId: string;
  let calendarBId: string;
  let eventId: string;

  it("registrerar användare, familjekonto och två kalendrar", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "cal-patch-int@bmad.test", password: "Lösenord1!", name: "Patchtest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Patchfamiljen" });
    expect(setup.status).toBe(201);
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const calA = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ id: `cal-a-${crypto.randomUUID()}`, name: "Kalender A", color: "#ffffff", ownerId: memberId });
    expect(calA.status).toBe(201);
    calendarAId = (calA.body as { id: string }).id;

    const calB = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ id: `cal-b-${crypto.randomUUID()}`, name: "Kalender B", color: "#000000", ownerId: memberId });
    expect(calB.status).toBe(201);
    calendarBId = (calB.body as { id: string }).id;
  });

  it("skapar en händelse i Kalender A", async () => {
    eventId = `event-patch-${crypto.randomUUID()}`;
    const res = await request(app)
      .post(`/api/calendars/${calendarAId}/events`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: eventId,
        calendarId: calendarAId,
        title: "Tandläkare",
        startsAt: "2026-08-01T10:00:00.000Z",
        endsAt: "2026-08-01T11:00:00.000Z",
        isAllDay: false,
        color: null,
        uid: null,
        subscriptionId: null,
        location: null,
        notes: null,
        recurrence: { type: "none", interval: 1, until: null },
        attendees: [],
        symbol: null,
        createdBy: memberId,
        deletedAt: null,
        deletedBy: null,
      });
    expect(res.status).toBe(201);
  });

  it("PATCH sparar symbol/location/isAllDay (tidigare tyst strippade)", async () => {
    const res = await request(app)
      .patch(`/api/calendars/${calendarAId}/events/${eventId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ symbol: "🦷", location: "Tandvårdskliniken", isAllDay: true });
    expect(res.status).toBe(200);

    const get = await request(app)
      .get("/api/calendars")
      .query({ from: "2026-08-01", until: "2026-08-01" })
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const calendar = (get.body as Array<{ id: string; events: Array<{ id: string; symbol: string | null; location: string | null; isAllDay: boolean }>; }>)
      .find((c) => c.id === calendarAId);
    const event = calendar?.events.find((e) => e.id === eventId);
    expect(event?.symbol).toBe("🦷");
    expect(event?.location).toBe("Tandvårdskliniken");
    expect(event?.isAllDay).toBe(true);
  });

  it("PATCH med ett avvikande calendarId flyttar händelsen till målkalendern", async () => {
    const res = await request(app)
      .patch(`/api/calendars/${calendarAId}/events/${eventId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ calendarId: calendarBId });
    expect(res.status).toBe(200);

    const get = await request(app)
      .get("/api/calendars")
      .query({ from: "2026-08-01", until: "2026-08-01" })
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const calendars = get.body as Array<{ id: string; events: Array<{ id: string; calendarId: string; symbol: string | null }> }>;

    const oldCalendar = calendars.find((c) => c.id === calendarAId);
    expect(oldCalendar?.events.find((e) => e.id === eventId)).toBeUndefined();

    const newCalendar = calendars.find((c) => c.id === calendarBId);
    const movedEvent = newCalendar?.events.find((e) => e.id === eventId);
    expect(movedEvent).toBeDefined();
    expect(movedEvent?.calendarId).toBe(calendarBId);
    expect(movedEvent?.symbol).toBe("🦷");
  });
});
