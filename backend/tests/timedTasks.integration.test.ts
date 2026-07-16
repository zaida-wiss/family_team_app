/**
 * Integrationstester för Medaljer/Rekord-flödet (Sprint 4 S1) mot riktig MongoDB.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI
 * där GitHub Actions startar en MongoDB-service. Hoppas över lokalt om
 * MONGODB_URI saknas eller pekar mot Atlas.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("Tidtagna uppgifter (Medaljer/Rekord) mot riktig MongoDB", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let taskId: string;

  it("registrerar användare och skapar familjekonto", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send({ email: "timed-int@bmad.test", password: "Lösenord1!", name: "Integrationstest" });
    expect(registerRes.status).toBe(201);
    accessToken = registerRes.body.accessToken as string;

    const setupRes = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Integrationsfamiljen" });
    expect(setupRes.status).toBe(201);
    memberId = (setupRes.body as { membership: { member: { id: string } } }).membership.member.id;
  });

  it("skapar en tidtagen uppgift", async () => {
    const res = await request(app)
      .post("/api/timed-tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ title: "Springa ett varv", symbol: "🏃", assignedTo: memberId });
    expect(res.status).toBe(201);
    taskId = (res.body as { id: string }).id;
    expect(taskId).toBeDefined();
  });

  it("listan visar uppgiften utan personbästa än", async () => {
    const res = await request(app)
      .get("/api/timed-tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const task = (res.body as Array<{ id: string; bestDurationMs: number | null; attemptCount: number }>)
      .find((t) => t.id === taskId);
    expect(task?.bestDurationMs).toBeNull();
    expect(task?.attemptCount).toBe(0);
  });

  it("första försöket blir ett nytt rekord", async () => {
    const res = await request(app)
      .post(`/api/timed-tasks/${taskId}/attempts`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ durationMs: 45000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ durationMs: 45000, isNewRecord: true });
  });

  it("ett sämre andra försök blir inte ett nytt rekord", async () => {
    const res = await request(app)
      .post(`/api/timed-tasks/${taskId}/attempts`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ durationMs: 50000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ durationMs: 50000, isNewRecord: false });
  });

  it("ett bättre tredje försök blir ett nytt rekord", async () => {
    const res = await request(app)
      .post(`/api/timed-tasks/${taskId}/attempts`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ durationMs: 40000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ durationMs: 40000, isNewRecord: true });
  });

  it("listan visar rätt personbästa och antal försök", async () => {
    const res = await request(app)
      .get("/api/timed-tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const task = (res.body as Array<{ id: string; bestDurationMs: number | null; attemptCount: number }>)
      .find((t) => t.id === taskId);
    expect(task?.bestDurationMs).toBe(40000);
    expect(task?.attemptCount).toBe(3);
  });

  let attemptToDeleteId: string;

  it("hämtar attempts-listan för uppgiften, senast först", async () => {
    const res = await request(app)
      .get(`/api/timed-tasks/${taskId}/attempts`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const attempts = res.body as Array<{ id: string; durationMs: number; achievedAt: string }>;
    expect(attempts).toHaveLength(3);
    expect(attempts[0].durationMs).toBe(40000);
    attemptToDeleteId = attempts.find((a) => a.durationMs === 50000)!.id;
    expect(attemptToDeleteId).toBeDefined();
  });

  it("tar bort ett enskilt försök (mjukt) — försvinner ur listan, personbästa opåverkat", async () => {
    const deleteRes = await request(app)
      .delete(`/api/timed-tasks/${taskId}/attempts/${attemptToDeleteId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/timed-tasks/${taskId}/attempts`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(listRes.body).toHaveLength(2);
    expect((listRes.body as Array<{ id: string }>).some((a) => a.id === attemptToDeleteId)).toBe(false);

    const taskListRes = await request(app)
      .get("/api/timed-tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const task = (taskListRes.body as Array<{ id: string; bestDurationMs: number | null; attemptCount: number }>)
      .find((t) => t.id === taskId);
    expect(task?.bestDurationMs).toBe(40000);
    expect(task?.attemptCount).toBe(2);
  });

  it("raderar uppgiften — försvinner från listan", async () => {
    const deleteRes = await request(app)
      .delete(`/api/timed-tasks/${taskId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get("/api/timed-tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(listRes.body).toEqual([]);
  });
});

/**
 * Säkerhetsfynd fixat 2026-07-16 (samma klass av brist som ADR-0016/ADR-0009):
 * POST/DELETE /api/timed-tasks saknade all behörighetskontroll utöver
 * requireAuth+attachAccountId — vilket inloggat barn som helst kunde skapa/
 * ta bort valfri tidtagen uppgift om de anropade API:t direkt (UI:t visar
 * aldrig Medaljer/Rekord-inställningarna för barn). recordAttempt/
 * deleteAttempt verifierade heller aldrig att den anropande medlemmen var
 * uppgiftens mottagare (eller en förälder som hanterar det barnets konto) —
 * vem som helst i kontot kunde logga/radera ett försök på ett ANNAT barns
 * rekord.
 */
describe.skipIf(!RUN)("timedTasksService: server-side behörighetskontroll", () => {
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
  let otherChildMemberId: string;

  it("sätter upp konto med förälder och två barn", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "timed-perm-int@bmad.test", password: "Lösenord1!", name: "Behörighetstest" });
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Rekordfamiljen" });
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

    const otherChild = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ name: "Syskonet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    otherChildMemberId = (otherChild.body as { id: string }).id;
  });

  it("nekar ett barn att skapa en tidtagen uppgift", async () => {
    const res = await request(app)
      .post("/api/timed-tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ title: "Springa", symbol: "🏃", assignedTo: childMemberId });
    expect(res.status).toBe(403);
  });

  let taskId: string;

  it("tillåter föräldern att skapa en tidtagen uppgift åt barnet", async () => {
    const res = await request(app)
      .post("/api/timed-tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ title: "Springa", symbol: "🏃", assignedTo: childMemberId });
    expect(res.status).toBe(201);
    taskId = (res.body as { id: string }).id;
  });

  it("nekar syskonet att logga ett försök på ett ANNAT barns uppgift", async () => {
    const res = await request(app)
      .post(`/api/timed-tasks/${taskId}/attempts`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", otherChildMemberId)
      .send({ durationMs: 30000 });
    expect(res.status).toBe(403);
  });

  it("tillåter barnet att logga ett försök på sin egen uppgift", async () => {
    const res = await request(app)
      .post(`/api/timed-tasks/${taskId}/attempts`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ durationMs: 30000 });
    expect(res.status).toBe(201);
  });

  it("tillåter föräldern att logga ett försök åt barnet (canManageChildTodos)", async () => {
    const res = await request(app)
      .post(`/api/timed-tasks/${taskId}/attempts`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ durationMs: 25000 });
    expect(res.status).toBe(201);
  });

  it("nekar syskonet att ta bort ett annat barns uppgift", async () => {
    const res = await request(app)
      .delete(`/api/timed-tasks/${taskId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", otherChildMemberId);
    expect(res.status).toBe(403);
  });
});
