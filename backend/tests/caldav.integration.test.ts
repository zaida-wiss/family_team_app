/**
 * Integrationstester för Apple CalDAV-anslutningen (ADR-0027, 2026-07-24,
 * uppdaterad 2026-07-30 — Apple-inloggningen ligger nu på KONTONIVÅ, se
 * AppleCalDavAccount) mot riktig MongoDB. tsdav mockas — testerna verifierar
 * appens EGEN logik (kryptering, maskering, GDPR-uteslutning, push/pull-
 * inbindning), inte ett riktigt Apple-konto.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI.
 */

import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

const fetchCalendars = vi.fn(async () => [
  { url: "https://caldav.icloud.com/123/calendars/home/", displayName: "Hem" },
  { url: "https://caldav.icloud.com/123/calendars/work/", displayName: "Jobb" },
]);
const fetchCalendarObjects = vi.fn(async () => [] as { data: string; url: string; etag: string }[]);
const createCalendarObject = vi.fn(
  async () => new Response(null, { status: 201, headers: { etag: "\"etag-1\"" } })
);
const updateCalendarObject = vi.fn(async () => new Response(null, { status: 200 }));
const deleteCalendarObject = vi.fn(async () => new Response(null, { status: 204 }));

vi.mock("tsdav", () => ({
  createDAVClient: vi.fn(async () => ({
    fetchCalendars,
    fetchCalendarObjects,
    createCalendarObject,
    updateCalendarObject,
    deleteCalendarObject,
  })),
}));

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("Apple CalDAV-anslutning (ADR-0027, kontonivå 2026-07-30) mot riktig MongoDB", () => {
  let app: typeof import("../src/app.js").app;

  beforeAll(async () => {
    const appModule = await import("../src/app.js");
    const connModule = await import("../src/db/connection.js");
    app = appModule.app;
    await connModule.connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let accountId: string;
  let calendarId: string;
  let appleAccountId: string;

  it("registrerar konto och skapar en kalender", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "caldav-int@bmad.test", password: "Losenord1!", name: "CalDAV-test" });
    expect(registerRes.status).toBe(201);
    accessToken = registerRes.body.accessToken as string;

    const setupRes = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "CalDAV-familjen" });
    expect(setupRes.status).toBe(201);
    memberId = setupRes.body.membership.member.id as string;
    accountId = setupRes.body.membership.member.accountId as string;

    const calRes = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ id: `cal-${Date.now()}`, name: "Min kalender", color: "#2f7d6d", ownerId: memberId, sharedWith: [], events: [], importedSources: [], subscriptions: [], calDavConnections: [], deletedAt: null, deletedBy: null });
    expect(calRes.status).toBe(201);
    calendarId = calRes.body.id as string;
  });

  it("lägger till ett Apple-konto på KONTONIVÅ — svaret innehåller aldrig lösenordet i klartext", async () => {
    const res = await request(app)
      .post("/api/calendars/caldav/apple-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ accountEmail: "zaida@icloud.com", appSpecificPassword: "abcd-efgh-ijkl-mnop" });

    expect(res.status).toBe(201);
    expect(res.body.accountEmail).toBe("zaida@icloud.com");
    expect(JSON.stringify(res.body)).not.toContain("abcd-efgh-ijkl-mnop");
    expect(fetchCalendars).toHaveBeenCalled();
    appleAccountId = res.body.id as string;
  });

  it("listar Apple-kontots kalendrar UTAN att skriva in lösenordet igen", async () => {
    const res = await request(app)
      .post(`/api/calendars/caldav/apple-accounts/${appleAccountId}/calendars`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { url: "https://caldav.icloud.com/123/calendars/home/", name: "Hem" },
      { url: "https://caldav.icloud.com/123/calendars/work/", name: "Jobb" },
    ]);
  });

  it("GET /api/calendars/caldav/apple-accounts listar det tillagda kontot", async () => {
    const res = await request(app)
      .get("/api/calendars/caldav/apple-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accountEmail).toBe("zaida@icloud.com");
  });

  it("kopplar en BMAD-kalender till det redan tillagda Apple-kontots VALDA kalender", async () => {
    const res = await request(app)
      .post(`/api/calendars/${calendarId}/caldav/apple`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ appleAccountId, calendarUrl: "https://caldav.icloud.com/123/calendars/work/" });

    expect(res.status).toBe(201);
    expect(res.body.appleAccountId).toBe(appleAccountId);
    expect(res.body.externalCalendarHref).toBe("https://caldav.icloud.com/123/calendars/work/");
    expect(res.body.accountEmail).toBe("zaida@icloud.com");
  });

  it("nekar en andra anslutning på samma kalender (409)", async () => {
    const res = await request(app)
      .post(`/api/calendars/${calendarId}/caldav/apple`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ appleAccountId, calendarUrl: "https://caldav.icloud.com/123/calendars/home/" });
    expect(res.status).toBe(409);
  });

  it("GET /api/calendars visar den kopplade kalenderns Apple-e-post, aldrig ett lösenord", async () => {
    const res = await request(app)
      .get("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const cal = res.body.find((c: { id: string }) => c.id === calendarId);
    expect(cal.calDavConnections).toHaveLength(1);
    expect(cal.calDavConnections[0].accountEmail).toBe("zaida@icloud.com");
    expect(JSON.stringify(cal.calDavConnections[0])).not.toContain("abcd-efgh-ijkl-mnop");
    expect(JSON.stringify(cal.calDavConnections[0])).not.toContain("appSpecificPassword");
  });

  it("GDPR-exporten innehåller aldrig lösenordet, varken krypterat eller i klartext", async () => {
    const res = await request(app)
      .get(`/api/accounts/${accountId}/export`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("abcd-efgh-ijkl-mnop");
    expect(raw).not.toContain("appSpecificPasswordEnc");
    expect(raw).not.toContain("appSpecificPassword");
    const cal = res.body.calendars.find((c: { id: string }) => c.id === calendarId);
    expect(cal.calDavConnections[0].accountEmail).toBe("zaida@icloud.com");
  });

  it("en ny händelse i kalendern pushas till Apple (createCalendarObject anropas)", async () => {
    const eventId = `event-${Date.now()}`;
    const addRes = await request(app)
      .post(`/api/calendars/${calendarId}/events`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: eventId, calendarId, title: "Tandläkare", startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 3600_000).toISOString(), isAllDay: false, color: null, uid: null,
        subscriptionId: null, location: null, notes: null,
        recurrence: { type: "none", interval: 1, until: null }, attendees: [], symbol: null,
        createdBy: memberId, deletedAt: null, deletedBy: null
      });
    expect(addRes.status).toBe(201);

    // Routen pushar fire-and-forget (calendarsService.ts:s addEvent) — ett
    // andra, direkt anrop av pushEventUpsert här skulle race:a mot det och
    // ge en Mongoose VersionError (samma dokument laddat/muterat/sparat
    // två gånger samtidigt). vi.waitFor pollar istället utan att gissa på
    // en fast timing-paus eller dubbelanropa funktionen.
    await vi.waitFor(() => expect(createCalendarObject).toHaveBeenCalled());
  });

  it("koppla bort tar bort anslutningen och mjuk-raderar dess händelser — Apple-kontot lever kvar", async () => {
    const listRes = await request(app)
      .get("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const connectionId = listRes.body.find((c: { id: string }) => c.id === calendarId).calDavConnections[0].id as string;

    const delRes = await request(app)
      .delete(`/api/calendars/${calendarId}/caldav/${connectionId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(delRes.status).toBe(200);

    const after = await request(app)
      .get("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(after.body.find((c: { id: string }) => c.id === calendarId).calDavConnections).toHaveLength(0);

    // Apple-kontot självt är oberört — kan återanvändas för en annan kalender.
    const accountsRes = await request(app)
      .get("/api/calendars/caldav/apple-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(accountsRes.body).toHaveLength(1);
  });

  it("tar bort Apple-kontot helt — kopplar automatiskt bort alla kalendrar som använde det", async () => {
    // Koppla en NY anslutning igen så vi har något att koppla bort.
    const connectRes = await request(app)
      .post(`/api/calendars/${calendarId}/caldav/apple`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ appleAccountId, calendarUrl: "https://caldav.icloud.com/123/calendars/home/" });
    expect(connectRes.status).toBe(201);

    const delRes = await request(app)
      .delete(`/api/calendars/caldav/apple-accounts/${appleAccountId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(delRes.status).toBe(200);

    const after = await request(app)
      .get("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(after.body.find((c: { id: string }) => c.id === calendarId).calDavConnections).toHaveLength(0);

    const accountsRes = await request(app)
      .get("/api/calendars/caldav/apple-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(accountsRes.body).toHaveLength(0);
  });
});
