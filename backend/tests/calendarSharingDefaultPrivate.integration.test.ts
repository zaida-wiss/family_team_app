/**
 * Integrationstest (2026-08-11, Zaidas beslut: "Som standard skall inte min
 * kalender dyka upp i de andra familjemedlemmarnas kalender eller dashboard
 * såvida jag inte skrivit att den händelsen är tillsammans med dom" — se
 * docs/engineering-os/08-documentation/records/discussions/2026-08-11-
 * installningar-familjekonto-omorganisation.md).
 *
 * Verifierar getAllCalendars nya server-side behörighetsfiltrering:
 * - En VUXENS privata kalender syns INTE för en annan vuxen, även om den
 *   andra har canSeeAllCalendar (rollbypassen gäller sedan detta beslut
 *   bara BARNS kalendrar, föräldratillsyn).
 * - Ett BARNS kalender syns fortfarande för en canSeeAllCalendar-vuxen,
 *   oförändrat.
 * - Explicit delning (sharedWith) gör kalendern synlig igen, som väntat.
 * - En enskild händelse där jag taggats som attendee syns ÄNDÅ, även på en
 *   annars privat kalender — bara den taggade händelsen, inte hela
 *   kalendern.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import crypto from "crypto";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

const wideFrom = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
const wideUntil = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

function eventPayload(overrides: Record<string, unknown>) {
  return {
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 90_000_000).toISOString(),
    isAllDay: false, color: null, uid: null, subscriptionId: null, location: null, notes: null,
    recurrence: { type: "none", interval: 1, until: null }, attendees: [], symbol: null,
    deletedAt: null, deletedBy: null,
    ...overrides
  };
}

describe.skipIf(!RUN)("Kalendrars standardsynlighet — privat för vuxna, delning/attendee-tagg krävs", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let parentToken: string;
  let parentMemberId: string;
  let accountId: string;
  let larsToken: string;
  let larsMemberId: string;
  let novaMemberId: string;
  let parentCalId: string;
  let larsCalId: string;
  let novaCalId: string;

  it("bygger scenariot: förälder + en inbjuden vuxen (Lars) + ett barn (Nova) i samma konto", async () => {
    const email = `cal-privacy-parent-${crypto.randomUUID()}@bmad.test`;
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Lösenord1!", name: "Förälder" });
    parentToken = reg.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ name: "Familj Privacy" });
    accountId = setup.body.membership.account.id;
    parentMemberId = setup.body.membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${parentToken}`)
      .set("x-member-id", parentMemberId);
    const parentRoleId = (roles.body as Array<{ id: string; name: string }>).find((r) => r.name === "Förälder")!.id;
    const childRoleId = (roles.body as Array<{ id: string; name: string }>).find((r) => r.name === "Barn")!.id;

    // Lars bjuds in som en EGEN, fullvärdig vuxen medlem (egen roll = Förälder,
    // egen inloggning) — inte ett barn skapat direkt av admin.
    const larsEmail = `cal-privacy-lars-${crypto.randomUUID()}@bmad.test`;
    const invite = await request(app)
      .post(`/api/accounts/${accountId}/invite`)
      .set("Authorization", `Bearer ${parentToken}`)
      .set("x-member-id", parentMemberId)
      .send({ invitedEmail: larsEmail, memberName: "Lars", roleId: parentRoleId });
    const accept = await request(app)
      .post(`/api/invitations/${invite.body.invitation.token}/accept`)
      .send({ action: "register", email: larsEmail, password: "Lösenord1!", name: "Lars" });
    larsToken = accept.body.accessToken as string;
    larsMemberId = (accept.body.memberships as Array<{ member: { id: string; accountId: string } }>).find(
      (m) => m.member.accountId === accountId
    )!.member.id;

    // Nova är ett BARN, skapat direkt av föräldern (ingen egen inloggning).
    const createChild = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${parentToken}`)
      .set("x-member-id", parentMemberId)
      .send({ name: "Nova", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    expect(createChild.status).toBe(201);
    novaMemberId = createChild.body.id;

    expect(larsMemberId).toBeTruthy();
    expect(novaMemberId).toBeTruthy();
  });

  it("skapar en privat kalender+händelse för föräldern, för Lars, och för Nova", async () => {
    parentCalId = `cal-privacy-parent-${crypto.randomUUID()}`;
    const parentCal = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${parentToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: parentCalId, name: "Förälderns kalender", color: "#2f7d6d", ownerId: parentMemberId });
    expect(parentCal.status).toBe(201);
    const addParentEvent = await request(app)
      .post(`/api/calendars/${parentCalId}/events`)
      .set("Authorization", `Bearer ${parentToken}`)
      .set("x-member-id", parentMemberId)
      .send(eventPayload({ id: `ev-${crypto.randomUUID()}`, calendarId: parentCalId, title: "Förälderns privata möte", createdBy: parentMemberId }));
    expect(addParentEvent.status).toBe(201);

    larsCalId = `cal-privacy-lars-${crypto.randomUUID()}`;
    const larsCal = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${larsToken}`)
      .set("x-member-id", larsMemberId)
      .send({ id: larsCalId, name: "Lars kalender", color: "#a855f7", ownerId: larsMemberId });
    expect(larsCal.status).toBe(201);
    const addLarsPrivateEvent = await request(app)
      .post(`/api/calendars/${larsCalId}/events`)
      .set("Authorization", `Bearer ${larsToken}`)
      .set("x-member-id", larsMemberId)
      .send(eventPayload({ id: `ev-${crypto.randomUUID()}`, calendarId: larsCalId, title: "Lars hemliga möte", createdBy: larsMemberId }));
    expect(addLarsPrivateEvent.status).toBe(201);
    // En händelse där föräldern taggats som deltagare — ska synas för
    // föräldern ändå, trots att Lars kalender i övrigt är privat.
    const addSharedEvent = await request(app)
      .post(`/api/calendars/${larsCalId}/events`)
      .set("Authorization", `Bearer ${larsToken}`)
      .set("x-member-id", larsMemberId)
      .send(eventPayload({
        id: `ev-${crypto.randomUUID()}`, calendarId: larsCalId, title: "Middag ihop", createdBy: larsMemberId,
        attendees: [{ memberId: parentMemberId, status: "pending" }]
      }));
    expect(addSharedEvent.status).toBe(201);

    novaCalId = `cal-privacy-nova-${crypto.randomUUID()}`;
    const novaCal = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${parentToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: novaCalId, name: "Novas kalender", color: "#e07a5f", ownerId: novaMemberId });
    expect(novaCal.status).toBe(201);
    const addNovaEvent = await request(app)
      .post(`/api/calendars/${novaCalId}/events`)
      .set("Authorization", `Bearer ${parentToken}`)
      .set("x-member-id", parentMemberId)
      .send(eventPayload({ id: `ev-${crypto.randomUUID()}`, calendarId: novaCalId, title: "Novas läkarbesök", createdBy: parentMemberId }));
    expect(addNovaEvent.status).toBe(201);
  });

  it("Föräldern ser: sin egen kalender, Novas kalender (barn, canSeeAllCalendar), och BARA den attendee-taggade händelsen från Lars — inte Lars privata möte", async () => {
    const res = await request(app)
      .get(`/api/calendars?from=${wideFrom}&until=${wideUntil}`)
      .set("Authorization", `Bearer ${parentToken}`)
      .set("x-member-id", parentMemberId);
    expect(res.status).toBe(200);
    const byId = new Map((res.body as Array<{ id: string; events: Array<{ title: string }> }>).map((c) => [c.id, c]));

    expect(byId.get(parentCalId)?.events.map((e) => e.title)).toEqual(["Förälderns privata möte"]);
    expect(byId.get(novaCalId)?.events.map((e) => e.title)).toEqual(["Novas läkarbesök"]);
    expect(byId.get(larsCalId)?.events.map((e) => e.title)).toEqual(["Middag ihop"]);
  });

  it("Lars ser: sin egen kalender (båda händelserna), Novas kalender (barn) — men INTE föräldern privata möte", async () => {
    const res = await request(app)
      .get(`/api/calendars?from=${wideFrom}&until=${wideUntil}`)
      .set("Authorization", `Bearer ${larsToken}`)
      .set("x-member-id", larsMemberId);
    expect(res.status).toBe(200);
    const byId = new Map((res.body as Array<{ id: string; events: Array<{ title: string }> }>).map((c) => [c.id, c]));

    expect(byId.get(larsCalId)?.events.map((e) => e.title).sort()).toEqual(["Lars hemliga möte", "Middag ihop"].sort());
    expect(byId.get(novaCalId)?.events.map((e) => e.title)).toEqual(["Novas läkarbesök"]);
    expect(byId.has(parentCalId)).toBe(false);
  });

  it("Föräldern delar explicit sin kalender med Lars — nu ser Lars HELA kalendern, inte bara en taggad händelse", async () => {
    const share = await request(app)
      .post(`/api/calendars/${parentCalId}/share`)
      .set("Authorization", `Bearer ${parentToken}`)
      .set("x-member-id", parentMemberId)
      .send({ memberId: larsMemberId, access: "view" });
    expect(share.status).toBe(200);

    const res = await request(app)
      .get(`/api/calendars?from=${wideFrom}&until=${wideUntil}`)
      .set("Authorization", `Bearer ${larsToken}`)
      .set("x-member-id", larsMemberId);
    const byId = new Map((res.body as Array<{ id: string; events: Array<{ title: string }> }>).map((c) => [c.id, c]));
    expect(byId.get(parentCalId)?.events.map((e) => e.title)).toEqual(["Förälderns privata möte"]);
  });
});
