/**
 * Integrationstest: paginering av todos-historik/papperskorg (2026-07-26,
 * Zaidas önskemål: "fixa pagineringen på todo"). `GET /api/todos` slutade
 * returnera mjuk-raderade todos (var tidigare kvar 30 dagar "för
 * papperskorgsvyn") — flyttat till en egen, paginerad `GET /api/todos/history`
 * (godkända/nekade/utgångna/raderade, inget tidsfönster längre eftersom
 * paginering redan löser den obegränsade tillväxten). Se todosService.ts:s
 * getTodosHistoryPage för det fulla resonemanget.
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
    isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    visibleFrom: null, expiresAt: null, completedAt: null, approvedBy: null,
    approvedAt: null, rejectedBy: null, rejectedAt: null, deletedAt: null, deletedBy: null,
    ...overrides
  };
}

describe.skipIf(!RUN)("GET /api/todos/history: paginering, GET /api/todos exkluderar papperskorgen", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  const pendingId = `todo-hist-pending-${crypto.randomUUID()}`;
  const deletedId = `todo-hist-deleted-${crypto.randomUUID()}`;
  const approvedId = `todo-hist-approved-${crypto.randomUUID()}`;
  const rejectedId = `todo-hist-rejected-${crypto.randomUUID()}`;
  const expiredId = `todo-hist-expired-${crypto.randomUUID()}`;

  it("sätter upp konto och fem todos i olika tillstånd (aktiv, raderad, godkänd, nekad, utgången)", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `todos-history-int-${crypto.randomUUID()}@bmad.test`, password: "Lösenord1!", name: "Historiktest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Historikfamiljen" });
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const create = (id: string, overrides: Record<string, unknown>) =>
      request(app)
        .post("/api/todos")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("x-member-id", memberId)
        .send({ id, title: id, createdBy: memberId, assignedTo: memberId, ...todoPayload(overrides) });

    expect((await create(pendingId, {})).status).toBe(201);
    expect((await create(deletedId, { deletedAt: new Date().toISOString(), deletedBy: memberId })).status).toBe(201);
    expect((await create(approvedId, { status: "approved", approvedAt: new Date().toISOString(), approvedBy: memberId })).status).toBe(201);
    expect((await create(rejectedId, { status: "rejected", rejectedAt: new Date().toISOString(), rejectedBy: memberId })).status).toBe(201);
    expect((await create(expiredId, { status: "expired", expiresAt: new Date().toISOString() })).status).toBe(201);
  });

  it("GET /api/todos returnerar bara den aktiva (pending) todon, inte papperskorgen", async () => {
    const res = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const ids = (res.body as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(deletedId);
    // Godkänd/nekad/utgången ligger KVAR i huvud-endpointen (medvetet
    // oförändrat — completedPercent m.fl. läser fortfarande härifrån,
    // se todosService.ts:s kommentar).
    expect(ids).toContain(approvedId);
    expect(ids).toContain(rejectedId);
    expect(ids).toContain(expiredId);
  });

  it("GET /api/todos/history returnerar raderad+godkänd+nekad+utgången, inte den aktiva pending-todon", async () => {
    const res = await request(app)
      .get("/api/todos/history?pageSize=50")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const ids = (res.body.items as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toContain(deletedId);
    expect(ids).toContain(approvedId);
    expect(ids).toContain(rejectedId);
    expect(ids).toContain(expiredId);
    expect(ids).not.toContain(pendingId);
    expect(res.body.total).toBeGreaterThanOrEqual(4);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
  });

  it("sidbrytning fungerar (pageSize=2 ger 2 rader per sida, tomt förbi sista sidan)", async () => {
    const page1 = await request(app)
      .get("/api/todos/history?page=1&pageSize=2")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(page1.body.items).toHaveLength(2);

    const farPage = await request(app)
      .get("/api/todos/history?page=999&pageSize=2")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(farPage.body.items).toHaveLength(0);
    expect(farPage.body.total).toBe(page1.body.total);
  });

  it("pageSize begränsas till max 100 även om ett högre värde efterfrågas", async () => {
    const res = await request(app)
      .get("/api/todos/history?pageSize=99999")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.body.pageSize).toBe(100);
  });
});
