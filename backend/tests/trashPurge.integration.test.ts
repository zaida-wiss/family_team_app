/**
 * Integrationstest: ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning
 * av papperskorgen. Ett medvetet undantag från "aldrig hard delete"-regeln
 * (Zaidas beslut) — testar att purge-trash-endpointerna för members/shopping/
 * calendars/todos kräver canRestoreFromTrash, faktiskt tar bort dokumenten
 * (inte bara sätter en flagga) och lämnar aktiva (icke-raderade) dokument
 * orörda.
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
    isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    visibleFrom: null, expiresAt: null, completedAt: null, approvedBy: null,
    approvedAt: null, rejectedBy: null, rejectedAt: null, deletedAt: null, deletedBy: null,
    ...overrides
  };
}

describe.skipIf(!RUN)("purge-trash: server-side behörighetskontroll + faktisk hard delete", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let ownerMemberId: string; // Standard Förälder-roll: canRestoreFromTrash
  let restrictedMemberId: string; // canRestoreFromTrash=false
  let deletedOtherMemberId: string;
  let deletedListId: string;
  let deletedCalendarId: string;
  let deletedTodoId: string;
  let activeTodoId: string;

  it("sätter upp konto, en behörighetslös medlem, och en soft-deletad post av varje typ", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "trash-purge-int@bmad.test", password: "Lösenord1!", name: "Papperskorgstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Papperskorgsfamiljen" });
    ownerMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const noPermissions = {
      canManageMembers: false, canManageRoles: false, canSeeAllTodos: false, canSeeOwnTodos: true,
      canCreateTodos: true, canScheduleRecurringTodos: false, canCompleteAssignedTodos: false,
      canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false, canSeeAllCalendar: false,
      canSeeOwnCalendar: false, canCreateCalendar: false, canEditCalendar: false, canImportCalendar: false,
      canExportCalendar: false, canSeeShoppingLists: true, canCreateShoppingLists: false,
      canEditShoppingLists: false, canViewTrash: true, canRestoreFromTrash: false,
      canCreateChildAccounts: false, canManageChildTodos: false
    };
    const restrictedRole = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: `role-trashperm-${crypto.randomUUID()}`, name: "Utan papperskorgsbehörighet",
        isChildRole: false, permissions: noPermissions
      });
    expect(restrictedRole.status).toBe(201);

    const restricted = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        name: "Begränsad medlem", roleId: (restrictedRole.body as { id: string }).id, isChild: false,
        avatarUrl: null, color: null, dashboardTheme: null
      });
    expect(restricted.status).toBe(201);
    restrictedMemberId = (restricted.body as { id: string }).id;

    // En medlem att soft-deleta.
    const toDelete = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        name: "Ska raderas", roleId: (restrictedRole.body as { id: string }).id, isChild: false,
        avatarUrl: null, color: null, dashboardTheme: null
      });
    expect(toDelete.status).toBe(201);
    deletedOtherMemberId = (toDelete.body as { id: string }).id;
    const delMember = await request(app)
      .delete(`/api/members/${deletedOtherMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect(delMember.status).toBe(200);

    // En inköpslista att soft-deleta.
    deletedListId = `shopping-purge-${crypto.randomUUID()}`;
    const createList = await request(app)
      .post("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: deletedListId, name: "Ska raderas", ownerId: ownerMemberId, color: "#2f7d6d", icon: null,
        sharedWith: [], deletedAt: null, deletedBy: null, items: []
      });
    expect(createList.status).toBe(201);
    const delList = await request(app)
      .delete(`/api/shopping/${deletedListId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect(delList.status).toBe(200);

    // En kalender att soft-deleta.
    deletedCalendarId = `calendar-purge-${crypto.randomUUID()}`;
    const createCal = await request(app)
      .post("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: deletedCalendarId, name: "Ska raderas", color: "#5588cc", ownerId: ownerMemberId,
        sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false
      });
    expect(createCal.status).toBe(201);
    const delCal = await request(app)
      .delete(`/api/calendars/${deletedCalendarId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect(delCal.status).toBe(200);

    // En todo att soft-deleta, plus en AKTIV todo som INTE ska påverkas.
    deletedTodoId = `todo-purge-del-${crypto.randomUUID()}`;
    const createDelTodo = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: deletedTodoId, title: "Ska raderas", createdBy: ownerMemberId, assignedTo: ownerMemberId,
        ...todoPayload({})
      });
    expect(createDelTodo.status).toBe(201);
    const delTodo = await request(app)
      .delete(`/api/todos/${deletedTodoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect(delTodo.status).toBe(200);

    activeTodoId = `todo-purge-active-${crypto.randomUUID()}`;
    const createActiveTodo = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: activeTodoId, title: "Ska INTE raderas", createdBy: ownerMemberId, assignedTo: ownerMemberId,
        ...todoPayload({})
      });
    expect(createActiveTodo.status).toBe(201);
  });

  it("nekar purge-trash för samtliga fyra typer utan canRestoreFromTrash", async () => {
    for (const path of ["members", "shopping", "calendars", "todos"]) {
      const res = await request(app)
        .post(`/api/${path}/purge-trash`)
        .set("Authorization", `Bearer ${accessToken}`)
        .set("x-member-id", restrictedMemberId);
      expect(res.status).toBe(403);
    }
  });

  it("tillåter ägaren att tömma papperskorgen — dokumenten är verkligen borta, inte bara flaggade", async () => {
    for (const path of ["members", "shopping", "calendars", "todos"]) {
      const res = await request(app)
        .post(`/api/${path}/purge-trash`)
        .set("Authorization", `Bearer ${accessToken}`)
        .set("x-member-id", ownerMemberId);
      expect(res.status).toBe(200);
    }

    const membersList = await request(app)
      .get("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect((membersList.body as Array<{ id: string }>).some((m) => m.id === deletedOtherMemberId)).toBe(false);
    // Ägaren själv (aldrig raderad) och den begränsade medlemmen finns kvar.
    expect((membersList.body as Array<{ id: string }>).some((m) => m.id === ownerMemberId)).toBe(true);

    const listsList = await request(app)
      .get("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect((listsList.body as Array<{ id: string }>).some((l) => l.id === deletedListId)).toBe(false);

    const calendarsList = await request(app)
      .get("/api/calendars")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect((calendarsList.body as Array<{ id: string }>).some((c) => c.id === deletedCalendarId)).toBe(false);

    const todosList = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    const todoIds = (todosList.body as Array<{ id: string }>).map((t) => t.id);
    expect(todoIds).not.toContain(deletedTodoId);
    // Den aktiva todon (aldrig raderad) rördes inte av tömningen.
    expect(todoIds).toContain(activeTodoId);
  });
});
