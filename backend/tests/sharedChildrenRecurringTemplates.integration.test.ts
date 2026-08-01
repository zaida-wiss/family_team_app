/**
 * Regressionstest (2026-08-01, Zaidas fynd: "i min todo vy står fortfarande
 * todo-mallar som tillhör olika familjer. Ta bort dessa.") — getSharedChildrenData
 * (ADR-0024) filtrerade tidigare bara på assignedTo===childId, utan att
 * exkludera återkommande MALLAR (recurrence.type!=="none"), till skillnad
 * från getCrossAccountFamilyTodos/getConnectionTodos som redan gjorde det.
 * En mall för ett delat barn dök därför upp som en egen, aldrig avklarbar
 * boll i SharedChildrenThreads.tsx (Todos-panelen).
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
  const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;

  return { accessToken, parentMemberId, accountId, childRoleId };
}

describe.skipIf(!RUN)("Delade barns todos: en återkommande MALL läcker inte in i SharedChildrenThreads", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it("en mall (recurrence.type!=none) för barnet syns INTE i shared-children, bara dess dagliga occurrence", async () => {
    const familyA = await registerFamily(`familjA-${crypto.randomUUID()}@bmad.test`, "Familj A");
    const familyB = await registerFamily(`familjB-${crypto.randomUUID()}@bmad.test`, "Familj B");

    const child = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ name: "Barnet", roleId: familyA.childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    expect(child.status).toBe(201);
    const childId = child.body.id as string;

    const share = await request(app)
      .post(`/api/members/${childId}/share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: familyB.parentMemberId, granteeAccountId: familyB.accountId, access: "view", relation: null, expiresAt: null });
    expect(share.status).toBe(201);

    await request(app)
      .post(`/api/members/pending-child-shares/${familyA.accountId}/${childId}/accept`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({});

    const todoPayload = (overrides: Record<string, unknown>) => ({
      isShared: false, status: "pending", starValue: 1,
      visual: { type: "lucide-icon", value: "Star" },
      visibleFrom: null, expiresAt: null, completedAt: null, approvedBy: null,
      approvedAt: null, rejectedBy: null, rejectedAt: null, rejectedReason: null,
      deletedAt: null, deletedBy: null, personalCategoryId: null, notes: null,
      recurringSourceId: null, occurrenceDate: null,
      ...overrides
    });

    const templateId = `todo-${crypto.randomUUID()}`;
    const template = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: templateId, title: "Borsta tänder (mall)", createdBy: familyA.parentMemberId, assignedTo: childId,
        recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null, end: { type: "never" } },
        ...todoPayload({})
      });
    expect(template.status).toBe(201);

    const occurrenceId = `todo-${crypto.randomUUID()}`;
    const occurrence = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: occurrenceId, title: "Borsta tänder", createdBy: familyA.parentMemberId, assignedTo: childId,
        recurrence: { type: "none" }, recurringSourceId: templateId,
        occurrenceDate: new Date().toISOString().slice(0, 10),
        ...todoPayload({})
      });
    expect(occurrence.status).toBe(201);

    const shared = await request(app)
      .get("/api/todos/shared-children")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(shared.status).toBe(200);
    const childData = (shared.body as Array<{ child: { id: string }; todos: Array<{ id: string }> }>).find(
      (d) => d.child.id === childId
    )!;
    const ids = childData.todos.map((t) => t.id);
    expect(ids).toContain(occurrenceId);
    expect(ids).not.toContain(templateId);
  });
});
