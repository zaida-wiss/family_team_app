/**
 * Integrationstest (2026-07-30, Zaidas önskemål: "alla privata kalendrar
 * som jag skapat skall jag kunna dela med samtliga familjer jag är medlem
 * i"). Samma "Mina familjekonton"-princip som
 * crossAccountFamilyTodos.integration.test.ts — en och samma användares
 * egna, riktiga medlemskap i flera konton. Synligheten är MEDVETET BARA för
 * mig själv (Zaidas val), aldrig andra medlemmar i mina andra familjer,
 * skiljer sig därmed från cross-account-todos (som visar en delad
 * "Familjen"-tråd, synlig för HELA det andra kontot).
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("Mina familjekonton — dela en egen kalender över flera EGNA medlemskap", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let accountA: { memberId: string; accountId: string };
  let accountB: { memberId: string; accountId: string };
  let outsiderToken: string;
  let outsiderMemberId: string;
  let sharedCalendarId: string;
  let unsharedCalendarId: string;

  it("en och samma användare skapar två separata familjekonton, plus en kalender i vardera", async () => {
    const email = `dubbelkonto-kalender-${crypto.randomUUID()}@bmad.test`;
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Losenord1!", name: "Zaida" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setupA = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Familj A" });
    accountA = {
      memberId: setupA.body.membership.member.id as string,
      accountId: setupA.body.membership.member.accountId as string
    };

    const setupB = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Familj B" });
    accountB = {
      memberId: setupB.body.membership.member.id as string,
      accountId: setupB.body.membership.member.accountId as string
    };
    expect(accountA.accountId).not.toBe(accountB.accountId);

    const outsider = await request(app)
      .post("/api/auth/register")
      .send({ email: `utomstaende-kalender-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Utomstående" });
    outsiderToken = outsider.body.accessToken as string;
    const outsiderSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ name: "Familj C" });
    outsiderMemberId = outsiderSetup.body.membership.member.id as string;

    // Kalender i konto B, DELAD (shareAcrossMyAccounts: true).
    sharedCalendarId = `cal-shared-${Date.now()}`;
    const sharedCal = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountB.memberId)
      .send({
        id: sharedCalendarId, name: "Jobbschema", color: "#2f7d6d", ownerId: accountB.memberId,
        sharedWith: [], events: [], importedSources: [], subscriptions: [], calDavConnections: [],
        deletedAt: null, deletedBy: null, shareAcrossMyAccounts: true
      });
    expect(sharedCal.status).toBe(201);

    // En ANNAN kalender i konto B, INTE delad — ska aldrig synas cross-account.
    unsharedCalendarId = `cal-private-${Date.now()}`;
    const privateCal = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountB.memberId)
      .send({
        id: unsharedCalendarId, name: "Helt privat", color: "#993333", ownerId: accountB.memberId,
        sharedWith: [], events: [], importedSources: [], subscriptions: [], calDavConnections: [],
        deletedAt: null, deletedBy: null
      });
    expect(privateCal.status).toBe(201);

    const eventId = `event-${Date.now()}`;
    const addEvent = await request(app)
      .post(`/api/calendars/${sharedCalendarId}/events`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountB.memberId)
      .send({
        id: eventId, calendarId: sharedCalendarId, title: "Möte med chefen",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 90_000_000).toISOString(),
        isAllDay: false, color: null, uid: null, subscriptionId: null, location: null, notes: null,
        recurrence: { type: "none", interval: 1, until: null }, attendees: [], symbol: null,
        createdBy: accountB.memberId, deletedAt: null, deletedBy: null
      });
    expect(addEvent.status).toBe(201);
  });

  it("GET /api/calendars/cross-account (från konto A) visar bara DEN DELADE kalenderns händelse, dekrypterad, med kontots namn", async () => {
    const res = await request(app)
      .get("/api/calendars/cross-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accountName).toBe("Familj B");
    expect(res.body[0].calendars).toHaveLength(1);
    expect(res.body[0].calendars[0].name).toBe("Jobbschema");
    expect(res.body[0].calendars[0].events).toHaveLength(1);
    expect(res.body[0].calendars[0].events[0].title).toBe("Möte med chefen");
    // 2026-07-30-fyndet ("RangeError: Invalid time value" i produktion) —
    // events lästes tidigare via ett vanligt Mongoose-dokument (inte
    // .lean()), så startsAt/endsAt kom tillbaka som undefined efter
    // decryptEvent:s {...event}-spread av ett subdokument. Kontrollerar
    // uttryckligen att det är en RIKTIG, giltig datumsträng, inte bara att
    // fältet råkar finnas.
    expect(res.body[0].calendars[0].events[0].startsAt).toBeTruthy();
    expect(Number.isNaN(new Date(res.body[0].calendars[0].events[0].startsAt).getTime())).toBe(false);
    expect(res.body[0].calendars[0].events[0].endsAt).toBeTruthy();
    expect(Number.isNaN(new Date(res.body[0].calendars[0].events[0].endsAt).getTime())).toBe(false);
  });

  it("en helt orelaterad utomstående ser ingenting", async () => {
    const res = await request(app)
      .get("/api/calendars/cross-account")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .set("x-member-id", outsiderMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("avmarkerar konto B (hiddenCrossAccountIds, samma fält som cross-account-todos) — döljer det ur vyn", async () => {
    const hide = await request(app)
      .patch(`/api/members/${accountA.memberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({ hiddenCrossAccountIds: [accountB.accountId] });
    expect(hide.status).toBe(200);

    const hidden = await request(app)
      .get("/api/calendars/cross-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(hidden.body).toEqual([]);

    await request(app)
      .patch(`/api/members/${accountA.memberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({ hiddenCrossAccountIds: [] });
  });

  it("stänger av delningen (shareAcrossMyAccounts: false) — kalendern försvinner ur cross-account-vyn", async () => {
    const off = await request(app)
      .patch(`/api/calendars/${sharedCalendarId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountB.memberId)
      .send({ shareAcrossMyAccounts: false });
    expect(off.status).toBe(200);

    const res = await request(app)
      .get("/api/calendars/cross-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(res.body).toEqual([]);
  });
});
