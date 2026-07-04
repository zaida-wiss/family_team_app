/**
 * Integrationstest (Sprint 5 S4): verifierar att audit-loggen faktiskt skriver en
 * post vid stjärnor-godkännande, köp och rolländring, att GET /api/audit-log
 * returnerar dem, och att den är kontoscopad (ett annat kontos poster syns aldrig).
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

describe.skipIf(!RUN)("Audit-logg", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let parentMemberId: string;
  let childMemberId: string;
  let roleId: string;
  let todoId: string;

  it("registrerar användare, familjekonto och ett barn", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "auditlog-int@bmad.test", password: "Lösenord1!", name: "Audittest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Auditfamiljen" });
    expect(setup.status).toBe(201);
    const body = setup.body as { membership: { member: { id: string } } };
    parentMemberId = body.membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);
    const childRole = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole);
    roleId = childRole!.id;

    const createChild = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ name: "Barnet", roleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    expect(createChild.status).toBe(201);
    childMemberId = (createChild.body as { id: string }).id;
  });

  it("godkänd todo skriver en stars_approved-post", async () => {
    todoId = `todo-audit-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({
        id: todoId,
        title: "Duka bordet",
        createdBy: parentMemberId,
        assignedTo: childMemberId,
        isShared: false,
        status: "pending",
        starValue: 7,
        visual: { type: "lucide-icon", value: "Star" },
        recurrence: { type: "none", interval: 1, until: null },
        visibleFrom: null,
        expiresAt: null,
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        deletedAt: null,
        deletedBy: null,
      });

    await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({});

    const approve = await request(app)
      .patch(`/api/todos/${todoId}/approve`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({});
    expect(approve.status).toBe(200);

    const log = await request(app)
      .get("/api/audit-log")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);
    expect(log.status).toBe(200);
    const entry = (log.body.items as Array<{ action: string; summary: string }>).find(
      (e) => e.action === "stars_approved"
    );
    expect(entry?.summary).toContain("7 stjärnor");
    expect(entry?.summary).toContain("Duka bordet");
  });

  it("köp skriver en reward_purchased-post", async () => {
    const itemId = `item-audit-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/reward-shop/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({
        id: itemId,
        title: "Biobiljett",
        symbol: null,
        starCost: 5,
        timerMinutes: null,
        availability: null,
        requiredCategories: [],
        createdBy: parentMemberId,
        deletedAt: null,
      });

    const purchase = await request(app)
      .post(`/api/reward-shop/purchase/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({});
    expect(purchase.status).toBe(200);

    const log = await request(app)
      .get("/api/audit-log")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);
    const entry = (log.body.items as Array<{ action: string; summary: string }>).find(
      (e) => e.action === "reward_purchased"
    );
    expect(entry?.summary).toContain("Biobiljett");
  });

  it("rolländring skriver en role_permissions_changed-post", async () => {
    const patch = await request(app)
      .patch(`/api/roles/${roleId}/permissions`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ canSeeOwnCalendar: false });
    expect(patch.status).toBe(200);

    const log = await request(app)
      .get("/api/audit-log")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);
    const entry = (log.body.items as Array<{ action: string; summary: string }>).find(
      (e) => e.action === "role_permissions_changed"
    );
    expect(entry?.summary).toContain("canSeeOwnCalendar");
  });

  it("barnet (utan canManageMembers) nekas åtkomst till audit-loggen", async () => {
    const log = await request(app)
      .get("/api/audit-log")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId);
    expect(log.status).toBe(403);
  });

  it("ett annat konto ser inga av dessa poster (kontoscopning)", async () => {
    const otherRegister = await request(app)
      .post("/api/auth/register")
      .send({ email: "auditlog-other-int@bmad.test", password: "Lösenord1!", name: "Annan förälder" });
    const otherToken = otherRegister.body.accessToken as string;

    const otherSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: "Andra familjen" });
    const otherMemberId = (otherSetup.body as { membership: { member: { id: string } } }).membership.member.id;

    const log = await request(app)
      .get("/api/audit-log")
      .set("Authorization", `Bearer ${otherToken}`)
      .set("x-member-id", otherMemberId);
    expect(log.status).toBe(200);
    expect(log.body.items).toEqual([]);
  });
});
