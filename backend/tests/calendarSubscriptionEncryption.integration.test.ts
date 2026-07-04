/**
 * Integrationstest (ADR-0014 tillägg): verifierar att kalenderprenumerationers
 * url-fält krypteras i MongoDB och att API:et transparent dekrypterar tillbaka.
 * En läckt url kan ge åtkomst till användarens externa Google/Outlook-kalender
 * (många ICS-länkar bäddar in en hemlig token), inte bara appens egen data —
 * strukturellt känsligare än ett krypterat händelsenamn.
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

describe.skipIf(!RUN)("Kalenderprenumerationers url krypteras i databasen (ADR-0014 tillägg)", () => {
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
  let subId: string;

  const SECRET_URL = "https://example.invalid/hemlig-token-abc123/calendar.ics";

  it("registrerar användare och familjekonto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "cal-sub-crypt-int@bmad.test", password: "Lösenord1!", name: "Krypteringstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Krypteringsfamiljen 3" });
    expect(setup.status).toBe(201);
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    calendarId = `cal-${crypto.randomUUID()}`;
    const createCal = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ id: calendarId, name: "Skolkalender", color: "#5588cc", ownerId: memberId, sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false });
    expect(createCal.status).toBe(201);
  });

  it("skapar en prenumeration med en hemlig url", async () => {
    const res = await request(app)
      .post(`/api/calendars/${calendarId}/subscriptions`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ url: SECRET_URL });
    expect(res.status).toBe(201);
    subId = (res.body as { id: string }).id;
    // Skapa-svaret ska returnera klartext-url:en direkt, inte krypteringsstrukturen.
    expect((res.body as { url: string }).url).toBe(SECRET_URL);
  });

  it("raw MongoDB-dokumentet innehåller inte klartexten", async () => {
    const doc = await CalendarModel.findOne({ id: calendarId }).lean();
    const sub = doc?.subscriptions.find((s) => s.id === subId);
    expect(sub?.url).not.toBe(SECRET_URL);
    expect(sub?.url.startsWith("v1:")).toBe(true);
  });

  it("GET /api/calendars returnerar klartext-url:en (dekryptering transparent)", async () => {
    const res = await request(app)
      .get("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const calendar = (res.body as Array<{ id: string; subscriptions: Array<{ id: string; url: string }> }>).find(
      (c) => c.id === calendarId
    );
    const sub = calendar?.subscriptions.find((s) => s.id === subId);
    expect(sub?.url).toBe(SECRET_URL);
  });
});
