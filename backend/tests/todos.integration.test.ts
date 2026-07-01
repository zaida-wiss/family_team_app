/**
 * Integrationstester för todo-flödet mot riktig MongoDB.
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

  it("skapar ett todo", async () => {
    todoId = `todo-int-${crypto.randomUUID()}`;
    const res = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId,
        title: "Integrationstask",
        createdBy: memberId,
        assignedTo: memberId,
        isShared: false,
        status: "pending",
        starValue: 5,
        icon: { type: "lucide-icon", value: "Star" },
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

  it("slutför todo:t (status → done)", async () => {
    const res = await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("godkänner todo:t (status → approved)", async () => {
    const res = await request(app)
      .patch(`/api/todos/${todoId}/approve`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("verifierar att member.approvedStars ökade med 5", async () => {
    const res = await request(app)
      .get("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const member = (res.body as Array<{ id: string; approvedStars?: number }>)
      .find((m) => m.id === memberId);
    expect(member?.approvedStars).toBe(5);
  });
});
