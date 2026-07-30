/**
 * Integrationstest (ADR-0030-tillägg, 2026-07-30, Zaidas rättelse: "det
 * räcker att man delat familjeanslutningen... det räcker att man är med i
 * den") — kalendrar tillagda som en fjärde dataScope i Familjeanslutningar.
 * Skiljer sig från crossAccountCalendars.integration.test.ts (samma PERSON,
 * flera egna medlemskap, synligt bara för den personen) — det här är två
 * OLIKA familjekonton, synligt för HELA den anslutna familjen.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import crypto from "crypto";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

async function registerFamily(email: string, accountName: string) {
  const register = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Lösenord1!", name: "Förälder" });
  const accessToken = register.body.accessToken as string;

  const setup = await request(app)
    .post("/api/accounts/setup")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: accountName });
  const parentMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;
  const accountId = (setup.body as { membership: { account: { id: string } } }).membership.account.id;

  return { accessToken, parentMemberId, accountId, email };
}

describe.skipIf(!RUN)("ADR-0030-tillägg: Familjeanslutningar delar kalendrar", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let familyA: Awaited<ReturnType<typeof registerFamily>>;
  let familyB: Awaited<ReturnType<typeof registerFamily>>;
  let familyC: Awaited<ReturnType<typeof registerFamily>>;
  let exposedCalendarId: string;

  it("sätter upp tre familjer, A skapar en kalender + en händelse åt sin exponerade medlem", async () => {
    familyA = await registerFamily(`famconn-cal-a-${crypto.randomUUID()}@bmad.test`, "Familj A");
    familyB = await registerFamily(`famconn-cal-b-${crypto.randomUUID()}@bmad.test`, "Familj B");
    familyC = await registerFamily(`famconn-cal-c-${crypto.randomUUID()}@bmad.test`, "Familj C");

    exposedCalendarId = `cal-famconn-${crypto.randomUUID()}`;
    const cal = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: exposedCalendarId, name: "Moa jobb", color: "#2f7d6d", ownerId: familyA.parentMemberId,
        sharedWith: [], events: [], importedSources: [], subscriptions: [], calDavConnections: [],
        deletedAt: null, deletedBy: null
      });
    expect(cal.status).toBe(201);

    const eventId = `event-famconn-${crypto.randomUUID()}`;
    const addEvent = await request(app)
      .post(`/api/calendars/${exposedCalendarId}/events`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: eventId, calendarId: exposedCalendarId, title: "Kundmöte",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 90_000_000).toISOString(),
        isAllDay: false, color: null, uid: null, subscriptionId: null, location: null, notes: null,
        recurrence: { type: "none", interval: 1, until: null }, attendees: [], symbol: null,
        createdBy: familyA.parentMemberId, deletedAt: null, deletedBy: null
      });
    expect(addEvent.status).toBe(201);
  });

  it("A ansluter till B, exponerar sig själv, med dataScope.calendars på (todos/recept/inköp avstängda)", async () => {
    const invite = await request(app)
      .post(`/api/accounts/${familyA.accountId}/family-connections`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        otherAccountId: familyB.accountId,
        exposedMemberIds: [familyA.parentMemberId],
        access: "view",
        dataScope: { todos: false, recipes: false, shoppingLists: false, calendars: true }
      });
    expect(invite.status).toBe(201);

    const accept = await request(app)
      .post(`/api/accounts/${familyB.accountId}/family-connections/pending/${familyA.accountId}/accept`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({
        exposedMemberIds: [familyB.parentMemberId],
        access: "view",
        dataScope: { todos: false, recipes: false, shoppingLists: false, calendars: false }
      });
    expect(accept.status).toBe(200);
  });

  it("B ser A:s delade kalender (dekrypterad) via GET /api/calendars/connections", async () => {
    const res = await request(app)
      .get("/api/calendars/connections")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accountName).toBe("Familj A");
    expect(res.body[0].calendars).toHaveLength(1);
    expect(res.body[0].calendars[0].name).toBe("Moa jobb");
    expect(res.body[0].calendars[0].events).toHaveLength(1);
    expect(res.body[0].calendars[0].events[0].title).toBe("Kundmöte");
    // 2026-07-30-fyndet ("RangeError: Invalid time value" i produktion) —
    // se samma kommentar i crossAccountCalendars.integration.test.ts.
    expect(res.body[0].calendars[0].events[0].startsAt).toBeTruthy();
    expect(Number.isNaN(new Date(res.body[0].calendars[0].events[0].startsAt).getTime())).toBe(false);
    expect(res.body[0].calendars[0].events[0].endsAt).toBeTruthy();
    expect(Number.isNaN(new Date(res.body[0].calendars[0].events[0].endsAt).getTime())).toBe(false);
  });

  it("A ser INGET av B:s kalendrar (B accepterade med dataScope.calendars: false)", async () => {
    const res = await request(app)
      .get("/api/calendars/connections")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("en helt orelaterad tredje familj ser ingenting", async () => {
    const res = await request(app)
      .get("/api/calendars/connections")
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
