/**
 * Integrationstest (2026-07-22, Zaidas önskemål: "innan vi jobbar med cross
 * family så ska vi lösa det i vår familj" — "någon håller på med den här
 * uppgiften"-indikator, löst inom EGNA familjen först) — PATCH
 * /api/todos/:id/in-progress. targetMemberId (vem som läggs till/tas bort)
 * är avsiktligt SKILT från den inloggade anroparen, samma "delat
 * hushållsdon"-mönster som resten av tråd-vyns håll-in-flöde redan bygger
 * på — testar att toggling fungerar åt bägge håll, att completeTodo rensar
 * listan, och att en ogiltig medlem/todo nekas.
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

describe.skipIf(!RUN)("todos.ts: PATCH /:id/in-progress", () => {
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

  it("sätter upp konto med förälder och barn", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "in-progress-int@bmad.test", password: "Lösenord1!", name: "Testförälder" });
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Indikatorfamiljen" });
    parentMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);
    const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;

    const child = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ name: "Barnet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    childMemberId = (child.body as { id: string }).id;
  });

  it("lägger till och tar bort en medlem från inProgressBy, sätter/rensar inProgressSince", async () => {
    const todoId = `todo-inprogress-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Städa", createdBy: parentMemberId, assignedTo: parentMemberId, ...todoPayload({}) });

    const firstToggle = await request(app)
      .patch(`/api/todos/${todoId}/in-progress`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ targetMemberId: parentMemberId });
    expect(firstToggle.status).toBe(200);
    expect(firstToggle.body.inProgressBy).toEqual([parentMemberId]);
    expect(firstToggle.body.inProgressSince).not.toBeNull();

    // Föräldern lägger till BARNET (delat hushållsdon-mönster — inte bara sig själv).
    const secondToggle = await request(app)
      .patch(`/api/todos/${todoId}/in-progress`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ targetMemberId: childMemberId });
    expect(secondToggle.status).toBe(200);
    expect(secondToggle.body.inProgressBy.sort()).toEqual([childMemberId, parentMemberId].sort());
    // inProgressSince oförändrad — räknas alltid från FÖRSTA personen.
    expect(secondToggle.body.inProgressSince).toBe(firstToggle.body.inProgressSince);

    // Ta bort föräldern igen — barnet kvar, since fortsatt satt.
    const thirdToggle = await request(app)
      .patch(`/api/todos/${todoId}/in-progress`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ targetMemberId: parentMemberId });
    expect(thirdToggle.body.inProgressBy).toEqual([childMemberId]);
    expect(thirdToggle.body.inProgressSince).not.toBeNull();

    // Ta bort sista personen — since rensas till null.
    const fourthToggle = await request(app)
      .patch(`/api/todos/${todoId}/in-progress`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ targetMemberId: childMemberId });
    expect(fourthToggle.body.inProgressBy).toEqual([]);
    expect(fourthToggle.body.inProgressSince).toBeNull();
  });

  it("rensar inProgressBy/inProgressSince när uppgiften markeras klar", async () => {
    const todoId = `todo-inprogress-clear-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Diska", createdBy: parentMemberId, assignedTo: parentMemberId, ...todoPayload({}) });

    await request(app)
      .patch(`/api/todos/${todoId}/in-progress`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ targetMemberId: parentMemberId });

    const complete = await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({});
    expect(complete.status).toBe(200);

    const all = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);
    const saved = (all.body as Array<{ id: string; inProgressBy: string[]; inProgressSince: string | null }>).find(
      (t) => t.id === todoId
    )!;
    expect(saved.inProgressBy).toEqual([]);
    expect(saved.inProgressSince).toBeNull();
  });

  it("nekar en ogiltig medlem och en icke-existerande/redan avklarad todo", async () => {
    const todoId = `todo-inprogress-invalid-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Handla", createdBy: parentMemberId, assignedTo: parentMemberId, ...todoPayload({}) });

    const invalidMember = await request(app)
      .patch(`/api/todos/${todoId}/in-progress`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ targetMemberId: "finns-inte" });
    expect(invalidMember.status).toBe(404);

    const missingTodo = await request(app)
      .patch("/api/todos/finns-inte/in-progress")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ targetMemberId: parentMemberId });
    expect(missingTodo.status).toBe(404);
  });
});
