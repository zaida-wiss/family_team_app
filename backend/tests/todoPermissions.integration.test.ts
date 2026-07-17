/**
 * Integrationstest (2026-07-06): /api/todos/:id/complete, /approve, /reject,
 * PATCH /api/todos/:id och DELETE /api/todos/:id saknade helt server-side
 * behörighetskontroll — bara requireAuth+attachAccountId. Vilken inloggad
 * medlem som helst i kontot kunde anropa dessa direkt för VILKEN TODO SOM
 * HELST, oavsett tilldelning eller roll (samma klass av brist som redan
 * fixades en gång för roller generellt, ADR-0009). Fyndet upptäcktes 2026-07-05
 * under Sprint 6 S4, flaggat som högsta prioritet i teamgenomgången 2026-07-06.
 * PATCH/DELETE var en direkt uppföljning noterad i ADR-0016 samma dag.
 *
 * completeTodo har en extra nyans (se ADR-0016): en förälder får slutföra ett
 * BARNS uppgift åt barnet (håll-in-gesten i tråd-vyn), inte bara sin egen — det
 * täcks här via en förälder som har canManageChildTodos (standard för
 * Förälder-rollen) men INTE canCompleteAssignedTodos.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const NO_PERMISSIONS = {
  canManageMembers: false, canManageRoles: false, canSeeAllTodos: false, canSeeOwnTodos: true,
  canCreateTodos: true, canScheduleRecurringTodos: false, canCompleteAssignedTodos: false,
  canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false, canSeeAllCalendar: false,
  canSeeOwnCalendar: false, canCreateCalendar: false, canEditCalendar: false, canImportCalendar: false,
  canExportCalendar: false, canSeeShoppingLists: false, canCreateShoppingLists: false,
  canEditShoppingLists: false, canViewTrash: false, canRestoreFromTrash: false,
  canCreateChildAccounts: false, canManageChildTodos: false
};

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

describe.skipIf(!RUN)("todos.ts: server-side behörighetskontroll på complete/approve/reject", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let parentMemberId: string; // Standard Förälder-roll: canApproveTodos+canManageChildTodos, men INTE canCompleteAssignedTodos
  let childMemberId: string; // Standard Barn-roll: canCompleteAssignedTodos, men INTE canApproveTodos
  let restrictedMemberId: string; // Ingen relevant todo-behörighet alls

  it("sätter upp konto med förälder, barn och en medlem utan todo-behörigheter", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "todo-perm-int@bmad.test", password: "Lösenord1!", name: "Behörighetstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Behörighetsfamiljen" });
    parentMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);
    const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;

    const createRestrictedRole = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({
        id: `role-restricted-${crypto.randomUUID()}`,
        name: "Utan todo-behörigheter",
        isChildRole: false,
        permissions: NO_PERMISSIONS
      });
    expect(createRestrictedRole.status).toBe(201);
    const restrictedRoleId = (createRestrictedRole.body as { id: string }).id;

    const child = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ name: "Barnet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    expect(child.status).toBe(201);
    childMemberId = (child.body as { id: string }).id;

    const restricted = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({
        name: "Begränsad medlem", roleId: restrictedRoleId, isChild: false,
        avatarUrl: null, color: null, dashboardTheme: null
      });
    expect(restricted.status).toBe(201);
    restrictedMemberId = (restricted.body as { id: string }).id;
  });

  it("nekar complete på barnets todo för den begränsade medlemmen (varken egen eller canManageChildTodos)", async () => {
    const todoId = `todo-perm-child-a-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Diska", createdBy: parentMemberId, assignedTo: childMemberId, ...todoPayload({}) });

    const res = await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({});
    expect(res.status).toBe(403);
  });

  it("tillåter förälderns complete på barnets todo (canManageChildTodos), även utan egen canCompleteAssignedTodos", async () => {
    const todoId = `todo-perm-child-b-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Duka", createdBy: parentMemberId, assignedTo: childMemberId, ...todoPayload({}) });

    const res = await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({});
    expect(res.status).toBe(200);
  });

  it("tillåter barnets egen complete på sin tilldelade todo (canCompleteAssignedTodos)", async () => {
    const todoId = `todo-perm-child-c-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Borsta tänder", createdBy: parentMemberId, assignedTo: childMemberId, ...todoPayload({}) });

    const res = await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({});
    expect(res.status).toBe(200);
  });

  it("nekar complete för en annan medlems todo när anroparen varken är tilldelad eller får hantera barnets uppgifter", async () => {
    const todoId = `todo-perm-cross-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Förälderns egen sak", createdBy: parentMemberId, assignedTo: parentMemberId, ...todoPayload({}) });

    const res = await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({});
    expect(res.status).toBe(403);
  });

  it("nekar approve/reject utan canApproveTodos, tillåter med (regression)", async () => {
    const todoId = `todo-perm-approve-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Städa rummet", createdBy: parentMemberId, assignedTo: childMemberId, ...todoPayload({}) });

    const complete = await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({});
    expect(complete.status).toBe(200);

    const deniedApprove = await request(app)
      .patch(`/api/todos/${todoId}/approve`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({});
    expect(deniedApprove.status).toBe(403);

    const deniedReject = await request(app)
      .patch(`/api/todos/${todoId}/reject`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ reason: null });
    expect(deniedReject.status).toBe(403);

    const approve = await request(app)
      .patch(`/api/todos/${todoId}/approve`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({});
    expect(approve.status).toBe(200);
  });

  it("nekar PATCH/DELETE på en annan medlems todo utan canEditAnyTodos/canDeleteAnyTodos", async () => {
    const todoId = `todo-perm-edit-a-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Förälderns todo", createdBy: parentMemberId, assignedTo: parentMemberId, ...todoPayload({}) });

    const patch = await request(app)
      .patch(`/api/todos/${todoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ title: "Kapad titel" });
    expect(patch.status).toBe(403);

    const del = await request(app)
      .delete(`/api/todos/${todoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId);
    expect(del.status).toBe(403);
  });

  it("tillåter skaparen PATCH/DELETE på sin egen todo, även utan canEditAnyTodos/canDeleteAnyTodos", async () => {
    const todoId = `todo-perm-edit-b-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ id: todoId, title: "Begränsad medlems egen todo", createdBy: restrictedMemberId, assignedTo: restrictedMemberId, ...todoPayload({}) });

    const patch = await request(app)
      .patch(`/api/todos/${todoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ title: "Uppdaterad av mig själv" });
    expect(patch.status).toBe(200);

    const del = await request(app)
      .delete(`/api/todos/${todoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId);
    expect(del.status).toBe(200);
  });

  it("tillåter förälderns PATCH/DELETE på en todo skapad av någon annan, via canEditAnyTodos/canDeleteAnyTodos", async () => {
    const todoId = `todo-perm-edit-c-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Skapad av barnet", createdBy: childMemberId, assignedTo: childMemberId, ...todoPayload({}) });

    const patch = await request(app)
      .patch(`/api/todos/${todoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ title: "Redigerad av förälder" });
    expect(patch.status).toBe(200);

    const del = await request(app)
      .delete(`/api/todos/${todoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);
    expect(del.status).toBe(200);
  });

  it("nekar PATCH .../restore för en medlem utan canRestoreFromTrash (Sprint 8 S3)", async () => {
    const todoId = `todo-perm-restore-a-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Raderad todo", createdBy: parentMemberId, assignedTo: parentMemberId, ...todoPayload({}) });
    await request(app)
      .delete(`/api/todos/${todoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);

    const res = await request(app)
      .patch(`/api/todos/${todoId}/restore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({});
    expect(res.status).toBe(403);
  });

  it("tillåter PATCH .../restore för en medlem med canRestoreFromTrash (Sprint 8 S3)", async () => {
    const todoId = `todo-perm-restore-b-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ id: todoId, title: "Raderad todo 2", createdBy: parentMemberId, assignedTo: parentMemberId, ...todoPayload({}) });
    await request(app)
      .delete(`/api/todos/${todoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId);

    const res = await request(app)
      .patch(`/api/todos/${todoId}/restore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({});
    expect(res.status).toBe(200);
  });
});
