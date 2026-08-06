/**
 * Integrationstest (2026-08-06, Zaidas önskemål: "det skall vara möjligt
 * att dela sina egna kategorier med utvalda familjer") — dela EN egen
 * TodoCategory med en annan familj, icke-transitivt. Samma struktur/
 * täckning som shoppingExternalShares.integration.test.ts (ADR-0026).
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

function todoPayload(overrides: Record<string, unknown>) {
  return {
    isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    visibleFrom: null, expiresAt: null, completedAt: null, approvedBy: null,
    approvedAt: null, rejectedBy: null, rejectedAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null, inProgressBy: [], inProgressSince: null,
    ...overrides
  };
}

describe.skipIf(!RUN)("Dela en egen kategori med en annan familj", () => {
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
  let categoryId: string;
  let todoId: string;

  it("sätter upp tre separata familjer, en kategori och en uppgift i familj A", async () => {
    familyA = await registerFamily(`familjA-${crypto.randomUUID()}@bmad.test`, "Familj A");
    familyB = await registerFamily(`familjB-${crypto.randomUUID()}@bmad.test`, "Familj B");
    familyC = await registerFamily(`familjC-${crypto.randomUUID()}@bmad.test`, "Familj C");

    const category = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ name: "Packlista" });
    categoryId = category.body.id;

    todoId = `todo-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: todoId, title: "Packa badkläder", createdBy: familyA.parentMemberId, assignedTo: familyA.parentMemberId,
        ...todoPayload({ personalCategoryId: categoryId })
      });
  });

  it("familj B ser INGENTING delat innan en delning skapats", async () => {
    const res = await request(app)
      .get("/api/todos/shared-categories")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("familj B (obehörig, ingen delning än) kan INTE skapa en delning av familj A:s kategori", async () => {
    const res = await request(app)
      .post(`/api/todo-categories/${categoryId}/external-share`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ granteeMemberId: familyC.parentMemberId, granteeAccountId: familyC.accountId, access: "view" });
    expect(res.status).toBe(404); // kategorin hittas inte i familj B:s (fel) konto
  });

  it("familj A:s ägare slår upp familj B:s förälder via e-post och delar kategorin med 'view'", async () => {
    const lookup = await request(app)
      .post(`/api/todo-categories/${categoryId}/external-share/lookup`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ email: familyB.email });
    expect(lookup.status).toBe(200);
    expect(lookup.body.memberships).toHaveLength(1);
    expect(lookup.body.memberships[0].memberId).toBe(familyB.parentMemberId);

    const share = await request(app)
      .post(`/api/todo-categories/${categoryId}/external-share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: familyB.parentMemberId, granteeAccountId: familyB.accountId, access: "view" });
    expect(share.status).toBe(201);
  });

  it("familj B ser nu kategorins uppgift (dekrypterad titel), men kan INTE klarmarkera den med bara 'view'-åtkomst", async () => {
    const shared = await request(app)
      .get("/api/todos/shared-categories")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(shared.status).toBe(200);
    expect(shared.body).toHaveLength(1);
    expect(shared.body[0].access).toBe("view");
    expect(shared.body[0].category.id).toBe(categoryId);
    expect(shared.body[0].category.accountName).toBe("Familj A");
    expect(shared.body[0].todos.map((t: { id: string; title: string }) => t.title)).toContain("Packa badkläder");

    const complete = await request(app)
      .patch(`/api/todos/shared-categories/${familyA.accountId}/${todoId}/complete`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({});
    expect(complete.status).toBe(403);
  });

  it("familj C (helt orelaterad, ingen delning) ser fortsatt ingenting och kan inte skriva", async () => {
    const shared = await request(app)
      .get("/api/todos/shared-categories")
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId);
    expect(shared.body).toEqual([]);

    const complete = await request(app)
      .patch(`/api/todos/shared-categories/${familyA.accountId}/${todoId}/complete`)
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId)
      .send({});
    expect(complete.status).toBe(403);
  });

  it("familj B kan INTE dela kategorin vidare till familj C — strukturellt omöjligt, inte en flagga", async () => {
    const res = await request(app)
      .post(`/api/todo-categories/${categoryId}/external-share`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ granteeMemberId: familyC.parentMemberId, granteeAccountId: familyC.accountId, access: "view" });
    expect(res.status).toBe(404);
  });

  it("uppgraderar delningen till 'edit' — familj B kan nu klarmarkera uppgiften och bocka delmoment", async () => {
    const upgrade = await request(app)
      .post(`/api/todo-categories/${categoryId}/external-share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: familyB.parentMemberId, granteeAccountId: familyB.accountId, access: "edit" });
    expect(upgrade.status).toBe(201);

    const complete = await request(app)
      .patch(`/api/todos/shared-categories/${familyA.accountId}/${todoId}/complete`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({});
    expect(complete.status).toBe(200);

    const all = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    const saved = (all.body as Array<{ id: string; status: string }>).find((t) => t.id === todoId)!;
    expect(saved.status).toBe("approved");
  });

  it("återkallar delningen — familj B förlorar åtkomsten helt", async () => {
    const revoke = await request(app)
      .delete(`/api/todo-categories/${categoryId}/external-share/${familyB.accountId}/${familyB.parentMemberId}`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(revoke.status).toBe(200);

    const shared = await request(app)
      .get("/api/todos/shared-categories")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(shared.body).toEqual([]);
  });
});
