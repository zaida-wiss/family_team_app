/**
 * Integrationstest (ADR-0014): verifierar att kalenderns title/notes faktiskt
 * ligger krypterade i MongoDB — inte bara att API:et råkar round-trippa rätt,
 * vilket skulle missa en bugg där kryptering tyst hoppas över.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";
import { CalendarModel } from "../src/db/models/Calendar.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("Kalenderns title/notes krypteras i databasen (ADR-0014)", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let calendarId: string;

  const SECRET_TITLE = "Läkarbesök hos dr Andersson";
  const SECRET_NOTES = "Konfidentiellt ärende";

  it("registrerar användare, familjekonto och en kalender", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "cal-crypt-int@bmad.test", password: "Lösenord1!", name: "Krypteringstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Krypteringsfamiljen" });
    expect(setup.status).toBe(201);
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const calendar = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ id: `cal-int-${crypto.randomUUID()}`, name: "Testkalender", color: "#ffffff", ownerId: memberId });
    expect(calendar.status).toBe(201);
    calendarId = (calendar.body as { id: string }).id;
  });

  it("skapar en händelse med känslig title/notes", async () => {
    const res = await request(app)
      .post(`/api/calendars/${calendarId}/events`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: `event-int-${crypto.randomUUID()}`,
        calendarId,
        title: SECRET_TITLE,
        startsAt: "2026-08-01T10:00:00.000Z",
        endsAt: "2026-08-01T11:00:00.000Z",
        isAllDay: false,
        color: null,
        uid: null,
        subscriptionId: null,
        location: null,
        notes: SECRET_NOTES,
        recurrence: { type: "none", interval: 1, until: null },
        attendees: [],
        symbol: null,
        createdBy: memberId,
        deletedAt: null,
        deletedBy: null,
      });
    expect(res.status).toBe(201);
  });

  it("raw MongoDB-dokumentet innehåller inte klartexten", async () => {
    const doc = await CalendarModel.findOne({ id: calendarId }).lean();
    const event = doc?.events.find((e) => e.title.startsWith("v1:") || e.title === SECRET_TITLE);
    expect(event).toBeDefined();
    expect(event?.title).not.toBe(SECRET_TITLE);
    expect(event?.title.startsWith("v1:")).toBe(true);
    expect(event?.notes).not.toBe(SECRET_NOTES);
  });

  it("API:et returnerar klartext till klienten (dekryptering transparent)", async () => {
    const res = await request(app)
      .get("/api/calendars")
      .query({ from: "2026-08-01", until: "2026-08-01" })
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const calendar = (res.body as Array<{ id: string; events: Array<{ title: string; notes: string | null }> }>)
      .find((c) => c.id === calendarId);
    const event = calendar?.events.find((e) => e.title === SECRET_TITLE);
    expect(event).toBeDefined();
    expect(event?.notes).toBe(SECRET_NOTES);
  });
});
