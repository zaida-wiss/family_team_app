/**
 * Integrationstest (ADR-0024, 2026-07-22) — dela ett barns todos med en
 * annan vuxen, icke-transitivt, inom eller mellan familjekonton.
 *
 * Täcker POSITIVA fall (delning fungerar, både inom samma konto och mellan
 * två helt separata konton; "view" kontra "edit"; åter-delning fungerar
 * likadant) OCH NEGATIVA fall (obehörig medlem kan inte dela, en tredje
 * orelaterad vuxen ser ingenting, en mottagare med bara "view" kan inte
 * markera klar, en mottagare kan INTE dela vidare eftersom de aldrig
 * uppfyller canManageMembers-kravet i barnets EGET konto, och en
 * återkallad delning tar bort åtkomsten helt) — given säkerhetsstaken
 * (första gången ett API-anrop får verka mot data i ETT ANNAT konto).
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

function todoPayload(overrides: Record<string, unknown>) {
  return {
    isShared: false, status: "pending", starValue: 5,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    visibleFrom: null, expiresAt: null, completedAt: null, approvedBy: null,
    approvedAt: null, rejectedBy: null, rejectedAt: null, deletedAt: null, deletedBy: null,
    ...overrides
  };
}

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

  const roles = await request(app)
    .get("/api/roles")
    .set("Authorization", `Bearer ${accessToken}`)
    .set("x-member-id", parentMemberId);
  const parentRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => !r.isChildRole)!.id;
  const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;

  return { accessToken, parentMemberId, accountId, parentRoleId, childRoleId, email };
}

describe.skipIf(!RUN)("ADR-0024: dela ett barns todos med en annan vuxen", () => {
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
  let childId: string;
  let todoId: string;
  let calendarId: string;
  let eventId: string;
  let timedTaskId: string;

  it("sätter upp tre separata familjer och ett barn i familj A", async () => {
    familyA = await registerFamily(`familjA-${crypto.randomUUID()}@bmad.test`, "Familj A");
    familyB = await registerFamily(`familjB-${crypto.randomUUID()}@bmad.test`, "Familj B");
    familyC = await registerFamily(`familjC-${crypto.randomUUID()}@bmad.test`, "Familj C");

    const child = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ name: "Barnet", roleId: familyA.childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    childId = (child.body as { id: string }).id;

    todoId = `todo-shared-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ id: todoId, title: "Läxor", createdBy: familyA.parentMemberId, assignedTo: childId, ...todoPayload({}) });

    // Fixtures för 2026-07-27-utökningen (allt kopplat till barnets konto,
    // inte bara todos) — en kalenderhändelse ägd av barnet, en tidtagen
    // uppgift tilldelad barnet, och ett köp gjort ÅT barnet.
    const eventStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const eventEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();
    const calendar = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ id: `cal-shared-${crypto.randomUUID()}`, name: "Barnets kalender", color: "#ffffff", ownerId: childId });
    calendarId = (calendar.body as { id: string }).id;
    eventId = `event-shared-${crypto.randomUUID()}`;
    await request(app)
      .post(`/api/calendars/${calendarId}/events`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: eventId, calendarId, title: "Tandläkarbesök", startsAt: eventStart, endsAt: eventEnd,
        isAllDay: false, color: null, uid: null, subscriptionId: null, location: null, notes: null,
        recurrence: { type: "none", interval: 1, until: null }, attendees: [], symbol: null,
        createdBy: familyA.parentMemberId, deletedAt: null, deletedBy: null
      });

    const timedTask = await request(app)
      .post("/api/timed-tasks")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ title: "Klä på sig", symbol: "👕", assignedTo: childId });
    timedTaskId = (timedTask.body as { id: string }).id;

    // POST /items svarar bara {ok:true}, inte den skapade varan — id:t vi
    // själva skickade in är den enda källan till sanning här.
    const rewardItemId = `item-shared-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/reward-shop/items")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: rewardItemId, title: "Gratis kram", symbol: null, starCost: 0,
        timerMinutes: null, availability: null, requiredCategories: [], createdBy: familyA.parentMemberId, deletedAt: null
      });
    await request(app)
      .post(`/api/reward-shop/purchase/${rewardItemId}`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ forMemberId: childId });
  });

  it("familj B ser INGENTING delat innan en delning skapats", async () => {
    const res = await request(app)
      .get("/api/todos/shared-children")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("familj B (obehörig, ingen delning än) kan INTE skapa en delning av familj A:s barn", async () => {
    // familyB.parentMemberId tillhör inte familj A:s konto alls — attachAccountId
    // sätter deras EGET accountId, så anropet landar mot ETT ANNAT barn-id-utrymme.
    // Simulerar en obehörig genom att låtsas anropa MED familj A:s childId men
    // familj B:s egen kontoidentitet.
    const res = await request(app)
      .post(`/api/members/${childId}/share`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ granteeMemberId: familyC.parentMemberId, granteeAccountId: familyC.accountId, access: "view" });
    expect(res.status).toBe(404); // barnet hittas inte i familj B:s (fel) konto
  });

  it("familj A:s admin slår upp familj B:s förälder via e-post och delar barnet med 'view'", async () => {
    const lookup = await request(app)
      .post(`/api/members/${childId}/share/lookup`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ email: familyB.email });
    expect(lookup.status).toBe(200);
    expect(lookup.body.memberships).toHaveLength(1);
    expect(lookup.body.memberships[0].memberId).toBe(familyB.parentMemberId);

    const share = await request(app)
      .post(`/api/members/${childId}/share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: familyB.parentMemberId, granteeAccountId: familyB.accountId, access: "view" });
    expect(share.status).toBe(201);
  });

  // 2026-07-28, Zaidas önskemål: "det skall stå bekräftat vilka barn man
  // delar med vem och vilka behörigheter de har" — GET-listan ska visa
  // mottagarens namn och kontonamn, inte bara rå memberId/accountId.
  it("GET /:id/share visar mottagarens namn och kontonamn, inte bara memberId/accountId", async () => {
    const list = await request(app)
      .get(`/api/members/${childId}/share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      memberId: familyB.parentMemberId,
      accountId: familyB.accountId,
      access: "view",
      memberName: "Förälder",
      accountName: "Familj B"
    });
  });

  it("familj B ser nu barnets todos, men kan INTE markera klar med bara 'view'-åtkomst", async () => {
    const list = await request(app)
      .get("/api/todos/shared-children")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].access).toBe("view");
    expect(list.body[0].todos.map((t: { id: string }) => t.id)).toContain(todoId);

    const complete = await request(app)
      .patch(`/api/todos/shared/${familyA.accountId}/${childId}/${todoId}/complete`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({});
    expect(complete.status).toBe(403);
  });

  // 2026-07-27, Zaidas önskemål: "en förälder som tillhör en annan familj
  // ska få åtkomst till allt som är kopplat till barnets konto" — utökar
  // delningen från bara todos till även kalender/belöningar/Medaljer.
  it("familj B ser även barnets kalenderhändelser, köpta belöningar, stjärnor och tidtagna uppgifter", async () => {
    const list = await request(app)
      .get("/api/todos/shared-children")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(list.status).toBe(200);
    const entry = list.body[0];

    expect(entry.calendarEvents.map((e: { id: string }) => e.id)).toContain(eventId);
    expect(entry.calendarEvents[0].title).toBe("Tandläkarbesök");

    expect(entry.timedTasks.map((t: { id: string }) => t.id)).toContain(timedTaskId);

    expect(entry.purchasedRewards).toHaveLength(1);
    expect(entry.purchasedRewards[0].itemTitle).toBe("Gratis kram");

    expect(entry.stars).toEqual({ approved: 0, spent: 0 });
  });

  it("familj C (helt orelaterad, ingen delning) ser fortsatt ingenting och kan inte markera klar", async () => {
    const list = await request(app)
      .get("/api/todos/shared-children")
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId);
    expect(list.body).toEqual([]);

    const complete = await request(app)
      .patch(`/api/todos/shared/${familyA.accountId}/${childId}/${todoId}/complete`)
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId)
      .send({});
    expect(complete.status).toBe(403);
  });

  it("familj B kan INTE dela barnet vidare till familj C — strukturellt omöjligt, inte en flagga", async () => {
    const res = await request(app)
      .post(`/api/members/${childId}/share`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ granteeMemberId: familyC.parentMemberId, granteeAccountId: familyC.accountId, access: "view" });
    // familyB.parentMemberId har ingen medlemskap i familj A:s konto — barnet
    // "hittas inte" i deras (fel) kontokontext, exakt samma väg som ADR:ns
    // resonemang: en mottagare kan aldrig uppfylla canManageMembers i
    // BARNETS eget konto.
    expect(res.status).toBe(404);
  });

  it("uppgraderar delningen till 'edit' — familj B kan nu markera klar (blir 'done', väntar godkännande, inga stjärnor delas ut här)", async () => {
    const upgrade = await request(app)
      .post(`/api/members/${childId}/share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: familyB.parentMemberId, granteeAccountId: familyB.accountId, access: "edit" });
    expect(upgrade.status).toBe(201);

    const complete = await request(app)
      .patch(`/api/todos/shared/${familyA.accountId}/${childId}/${todoId}/complete`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({});
    expect(complete.status).toBe(200);

    const all = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    const saved = (all.body as Array<{ id: string; status: string; approvedBy: string | null }>).find((t) => t.id === todoId)!;
    expect(saved.status).toBe("done");
    expect(saved.approvedBy).toBeNull();
  });

  it("återkallar delningen — familj B förlorar åtkomsten helt", async () => {
    const revoke = await request(app)
      .delete(`/api/members/${childId}/share/${familyB.accountId}/${familyB.parentMemberId}`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(revoke.status).toBe(200);

    const list = await request(app)
      .get("/api/todos/shared-children")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(list.body).toEqual([]);
  });

  it("delning fungerar likadant INOM samma familjekonto (samma accountId på båda sidor)", async () => {
    const otherAdult = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ name: "Andra föräldern", roleId: familyA.parentRoleId, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });
    const otherAdultId = (otherAdult.body as { id: string }).id;

    const share = await request(app)
      .post(`/api/members/${childId}/share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: otherAdultId, granteeAccountId: familyA.accountId, access: "view" });
    expect(share.status).toBe(201);

    const list = await request(app)
      .get("/api/todos/shared-children")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", otherAdultId);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].child.id).toBe(childId);
  });
});
