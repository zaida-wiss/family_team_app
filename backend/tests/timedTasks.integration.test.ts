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
