/**
 * Integrationstester för todo-flödet mot riktig MongoDB.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI
 * där GitHub Actions startar en MongoDB-service. Hoppas över lokalt om
 * MONGODB_URI saknas eller pekar mot Atlas.
 *
 * 2026-07-05 (Zaidas rättelse): bara BARNENS uppgifter ska behöva ett separat
 * godkännande-steg — en vuxens egen personliga uppgift går direkt till
 * "approved" vid complete (ingen förälder-över-föräldern att godkänna åt).
 * Barn-flödet testas mot en riktig medlem med "Barn"-rollen nedan; ett eget
 * test verifierar auto-godkännandet för en vuxens egen uppgift.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("Todo-flöde mot riktig MongoDB", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let childId: string;
  let todoId: string;

  it("registrerar användare", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "int@bmad.test", password: "Lösenord1!", name: "Integrationstest" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("accessToken");
    accessToken = res.body.accessToken as string;
  });

  it("skapar familjekonto och hämtar memberId", async () => {
    const res = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Integrationsfamiljen" });
    expect(res.status).toBe(201);
    memberId = (res.body as { membership: { member: { id: string } } }).membership.member.id;
    expect(memberId).toBeDefined();
  });

  it("skapar ett barn", async () => {
    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>)
      .find((r) => r.isChildRole)?.id;
    expect(childRoleId).toBeDefined();

    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Barnet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    expect(res.status).toBe(201);
    childId = (res.body as { id: string }).id;
    expect(childId).toBeDefined();
  });

  it("skapar ett todo åt barnet", async () => {
    todoId = `todo-int-${crypto.randomUUID()}`;
    const res = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId,
        title: "Integrationstask",
        createdBy: memberId,
        assignedTo: childId,
        isShared: false,
        status: "pending",
        starValue: 5,
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
    expect(res.status).toBe(201);
  });

  it("slutför barnets todo (status → done, väntar på godkännande)", async () => {
    const res = await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childId)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("godkänner barnets todo (status → approved)", async () => {
    const res = await request(app)
      .patch(`/api/todos/${todoId}/approve`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("verifierar att barnets approvedStars ökade med 5", async () => {
    const res = await request(app)
      .get("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const child = (res.body as Array<{ id: string; approvedStars?: number }>)
      .find((m) => m.id === childId);
    expect(child?.approvedStars).toBe(5);
  });

  it("en vuxens egen personliga uppgift går direkt till approved vid complete, inget separat godkännande behövs", async () => {
    const personalTodoId = `todo-int-personal-${crypto.randomUUID()}`;
    const create = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: personalTodoId,
        title: "Handla mat",
        createdBy: memberId,
        assignedTo: memberId,
        isShared: false,
        status: "pending",
        starValue: 0,
        visual: { type: "lucide-icon", value: "Star" },
        recurrence: { type: "none" },
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
    expect(create.status).toBe(201);

    const complete = await request(app)
      .patch(`/api/todos/${personalTodoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(complete.status).toBe(200);

    // Ett separat godkännande ska inte behövas — och ska inte längre gå att
    // göra (todon är redan "approved", inte "done").
    const approveAttempt = await request(app)
      .patch(`/api/todos/${personalTodoId}/approve`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(approveAttempt.status).toBe(404);
  });

  // Timerfunktion (2026-07-07, Zaidas önskemål) — helt separat, enklare
  // system än TimedTask/Medaljer-Rekord: bara EN inspelad tid per todo,
  // skickas med i /complete-anropets body.
  it("sparar elapsedMs på en tidtagen todo vid complete", async () => {
    const timerTodoId = `todo-int-timer-${crypto.randomUUID()}`;
    const create = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: timerTodoId,
        title: "Städa rummet",
        createdBy: memberId,
        assignedTo: childId,
        isShared: false,
        status: "pending",
        starValue: 2,
        visual: { type: "lucide-icon", value: "Star" },
        recurrence: { type: "none" },
        visibleFrom: null,
        expiresAt: null,
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        deletedAt: null,
        deletedBy: null,
        timerEnabled: true,
        elapsedMs: null,
      });
    expect(create.status).toBe(201);

    const complete = await request(app)
      .patch(`/api/todos/${timerTodoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childId)
      .send({ elapsedMs: 4321 });
    expect(complete.status).toBe(200);

    const list = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const timerTodo = (list.body as Array<{ id: string; elapsedMs?: number | null }>)
      .find((t) => t.id === timerTodoId);
    expect(timerTodo?.elapsedMs).toBe(4321);
  });

  it("ignorerar elapsedMs för en todo som inte har timerEnabled", async () => {
    const noTimerTodoId = `todo-int-notimer-${crypto.randomUUID()}`;
    const create = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: noTimerTodoId,
        title: "Duka bordet",
        createdBy: memberId,
        assignedTo: childId,
        isShared: false,
        status: "pending",
        starValue: 1,
        visual: { type: "lucide-icon", value: "Star" },
        recurrence: { type: "none" },
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
    expect(create.status).toBe(201);

    const complete = await request(app)
      .patch(`/api/todos/${noTimerTodoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childId)
      .send({ elapsedMs: 9999 });
    expect(complete.status).toBe(200);

    const list = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const noTimerTodo = (list.body as Array<{ id: string; elapsedMs?: number | null }>)
      .find((t) => t.id === noTimerTodoId);
    expect(noTimerTodo?.elapsedMs ?? null).toBeNull();
  });
});
