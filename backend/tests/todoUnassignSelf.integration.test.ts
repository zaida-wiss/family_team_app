/**
 * Integrationstest (2026-08-03, Zaidas önskemål: "hur kan jag massradera
 * todos smidigt i Mina uppgifter? Todos som inte tillhör mig skall då sluta
 * assignas på mig, utan att uppgiften försvinner. Familjens todon skall
 * endast gå att tas bort från familjevyn.") — PATCH /api/todos/:id/unassign-self.
 * Snäv självbetjäningsendpoint (samma mönster som toggle-in-progress): bara
 * den som FAKTISKT är tilldelad todon just nu får ta bort sig själv (returnerar
 * uppgiften till familje-poolen, assignedTo+personalCategoryId → null), ingen
 * generell redigeringsrätt (canEditTodo, som kräver createdBy===mig) krävs
 * eller ges.
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

function todoPayload(overrides: Record<string, unknown>) {
  return {
    isShared: false, status: "pending", starValue: 5,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    visibleFrom: null, expiresAt: null, completedAt: null, approvedBy: null,
    approvedAt: null, rejectedBy: null, rejectedAt: null, deletedAt: null, deletedBy: null,
    ...overrides
  };
}

describe.skipIf(!RUN)("todos.ts: PATCH /:id/unassign-self", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let secondMemberId: string;

  it("registrerar familj och en andra vuxen", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `unassign-self-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Testförälder" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Avassign-familjen" });
    memberId = setup.body.membership.member.id as string;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const parentRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => !r.isChildRole)!.id;

    const secondMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Andra föräldern", roleId: parentRoleId, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });
    secondMemberId = secondMember.body.id as string;
  });

  it("en uppgift NÅGON ANNAN skapat och tilldelat mig: unassign-self nollställer assignedTo OCH personalCategoryId, raderar inte", async () => {
    const todoId = `todo-unassign-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId)
      .send({
        id: todoId, title: "Handla mjölk", createdBy: secondMemberId, assignedTo: memberId,
        personalCategoryId: "cat-nagon-annans",
        ...todoPayload({})
      });

    const result = await request(app)
      .patch(`/api/todos/${todoId}/unassign-self`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });

    const all = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const saved = (all.body as Array<{ id: string; assignedTo: string | null; personalCategoryId: string | null; deletedAt: string | null }>).find(
      (t) => t.id === todoId
    )!;
    expect(saved.assignedTo).toBeNull();
    expect(saved.personalCategoryId).toBeNull();
    expect(saved.deletedAt).toBeNull(); // aldrig raderad, bara avassignerad
  });

  it("nekar en medlem som INTE är den nuvarande mottagaren (kan bara ta bort sig SJÄLV)", async () => {
    const todoId = `todo-unassign-notme-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ id: todoId, title: "Städa", createdBy: memberId, assignedTo: memberId, ...todoPayload({}) });

    const attempt = await request(app)
      .patch(`/api/todos/${todoId}/unassign-self`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId)
      .send({});
    expect(attempt.status).toBe(403);

    const all = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const saved = (all.body as Array<{ id: string; assignedTo: string | null }>).find((t) => t.id === todoId)!;
    expect(saved.assignedTo).toBe(memberId); // oförändrad
  });

  it("nekar en icke-existerande todo", async () => {
    const missing = await request(app)
      .patch("/api/todos/finns-inte/unassign-self")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(missing.status).toBe(404);
  });
});
