/**
 * Integrationstest (2026-07-27, Zaidas önskemål: "jag ska även kunna...
 * överföra dem till andra familjer") — permanent flytt av ett barns
 * medlemskap till en annan familjs konto, med hela historiken (Zaidas val:
 * "allt flyttar med"). Täcker särskilt det mest riskfyllda: krypterade
 * fält (Todo.title/notes/rejectedReason, CalendarEvent.title/notes,
 * Reward.title) måste dekrypteras med käll-kontots nyckel och återkrypteras
 * med mål-kontots INNAN accountId byts — annars blir texten permanent
 * oläsbar (fel nyckel, GCM-autentiseringen underkänns).
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

describe.skipIf(!RUN)("Överför ett barn permanent till en annan familj (2026-07-27)", () => {
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
  let rewardId: string;
  let timedTaskId: string;

  it("sätter upp källfamilj A, målfamilj B, en orelaterad familj C och ett barn i A med data i varje domän", async () => {
    familyA = await registerFamily(`transferA-${crypto.randomUUID()}@bmad.test`, "Familj A");
    familyB = await registerFamily(`transferB-${crypto.randomUUID()}@bmad.test`, "Familj B");
    familyC = await registerFamily(`transferC-${crypto.randomUUID()}@bmad.test`, "Familj C");

    const child = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ name: "Barnet", roleId: familyA.childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    childId = (child.body as { id: string }).id;

    // En delning (ADR-0024) mot familj C, innan överföringen — ska överleva
    // flytten ("allt flyttar med" gäller även redan utfärdade delningar).
    await request(app)
      .post(`/api/members/${childId}/share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: familyC.parentMemberId, granteeAccountId: familyC.accountId, access: "view" });

    todoId = `todo-transfer-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: todoId, title: "Hemlig läxa åäö", createdBy: familyA.parentMemberId, assignedTo: childId,
        isShared: false, status: "pending", starValue: 5, visual: { type: "lucide-icon", value: "Star" },
        recurrence: { type: "none" }, visibleFrom: null, expiresAt: null, completedAt: null,
        approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null, deletedAt: null, deletedBy: null
      });

    const calendar = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ id: `cal-transfer-${crypto.randomUUID()}`, name: "Barnets kalender", color: "#ffffff", ownerId: childId });
    calendarId = (calendar.body as { id: string }).id;
    eventId = `event-transfer-${crypto.randomUUID()}`;
    const eventStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const eventEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();
    await request(app)
      .post(`/api/calendars/${calendarId}/events`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: eventId, calendarId, title: "Hemligt tandläkarbesök", startsAt: eventStart, endsAt: eventEnd,
        isAllDay: false, color: null, uid: null, subscriptionId: null, location: null, notes: "Hemliga anteckningar",
        recurrence: { type: "none", interval: 1, until: null }, attendees: [], symbol: null,
        createdBy: familyA.parentMemberId, deletedAt: null, deletedBy: null
      });

    rewardId = `reward-transfer-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/rewards")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: rewardId, title: "Hemlig önskning", symbol: null, wishedBy: childId, starsNeeded: 20,
        status: "suggested", approvedBy: null, approvedAt: null, redeemedAt: null, deletedAt: null, deletedBy: null
      });

    const rewardItemId = `item-transfer-${crypto.randomUUID()}`;
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

    const timedTask = await request(app)
      .post("/api/timed-tasks")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ title: "Springa ett varv", symbol: "🏃", assignedTo: childId });
    timedTaskId = (timedTask.body as { id: string }).id;
    await request(app)
      .post(`/api/timed-tasks/${timedTaskId}/attempts`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", childId)
      .send({ durationMs: 65000, achievedAt: new Date().toISOString() });
  });

  it("en obehörig (familj C, ingen delning av transfer-rätt) kan inte överföra barnet", async () => {
    const res = await request(app)
      .post(`/api/members/${childId}/transfer`)
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId)
      .send({ targetMemberId: familyB.parentMemberId, targetAccountId: familyB.accountId });
    // familyC.parentMemberId tillhör inte familj A:s konto — attachAccountId
    // sätter deras EGET konto, så barnet hittas inte i "fel" kontot.
    expect(res.status).toBe(404);
  });

  it("familj A överför barnet till familj B", async () => {
    const res = await request(app)
      .post(`/api/members/${childId}/transfer`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ targetMemberId: familyB.parentMemberId, targetAccountId: familyB.accountId });
    expect(res.status).toBe(200);
  });

  it("barnet är helt borta ur familj A, men finns i familj B med rätt roll och bevarad delning", async () => {
    const listA = await request(app)
      .get("/api/members")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(listA.body.map((m: { id: string }) => m.id)).not.toContain(childId);

    const listB = await request(app)
      .get("/api/members")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    const childInB = listB.body.find((m: { id: string }) => m.id === childId);
    expect(childInB).toBeDefined();
    expect(childInB.accountId).toBe(familyB.accountId);
    expect(childInB.isChild).toBe(true);
    expect(childInB.roleId).not.toBe(familyA.childRoleId);
    expect(childInB.childSharedWith).toHaveLength(1);
    expect(childInB.childSharedWith[0].accountId).toBe(familyC.accountId);

    const rolesB = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    const childRoleInB = rolesB.body.find((r: { id: string }) => r.id === childInB.roleId);
    expect(childRoleInB.isChildRole).toBe(true);
  });

  it("todon flyttade med, korrekt dekrypteringsbar i familj B", async () => {
    const todosA = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(todosA.body.map((t: { id: string }) => t.id)).not.toContain(todoId);

    const todosB = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    const todo = todosB.body.find((t: { id: string }) => t.id === todoId);
    expect(todo).toBeDefined();
    expect(todo.title).toBe("Hemlig läxa åäö");
    expect(todo.accountId).toBe(familyB.accountId);
  });

  it("kalenderhändelsen flyttade med, korrekt dekrypteringsbar i familj B", async () => {
    const calendarsB = await request(app)
      .get(`/api/calendars?from=2026-01-01&until=2026-12-31`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    const calendar = calendarsB.body.find((c: { id: string }) => c.id === calendarId);
    expect(calendar).toBeDefined();
    expect(calendar.ownerId).toBe(childId);
    const event = calendar.events.find((e: { id: string }) => e.id === eventId);
    expect(event.title).toBe("Hemligt tandläkarbesök");
    expect(event.notes).toBe("Hemliga anteckningar");
  });

  it("önskningen (Reward) flyttade med, korrekt dekrypteringsbar i familj B", async () => {
    const rewardsB = await request(app)
      .get("/api/rewards")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    const reward = rewardsB.body.find((r: { id: string }) => r.id === rewardId);
    expect(reward).toBeDefined();
    expect(reward.title).toBe("Hemlig önskning");
  });

  it("köpt belöning och tidtagen uppgift (med försök) flyttade med", async () => {
    const purchasedB = await request(app)
      .get("/api/reward-shop/purchased?page=1&pageSize=25")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(purchasedB.body.items.some((p: { memberId: string }) => p.memberId === childId)).toBe(true);

    const timedTasksB = await request(app)
      .get("/api/timed-tasks")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    const task = timedTasksB.body.find((t: { id: string }) => t.id === timedTaskId);
    expect(task).toBeDefined();
    expect(task.bestDurationMs).toBe(65000);
    expect(task.attemptCount).toBe(1);
  });

  it("kan inte överföra ett barn till dess EGET (nuvarande) konto", async () => {
    const res = await request(app)
      .post(`/api/members/${childId}/transfer`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ targetMemberId: familyB.parentMemberId, targetAccountId: familyB.accountId });
    expect(res.status).toBe(400);
  });
});
