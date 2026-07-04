/**
 * Integrationstest (ADR-0014 tillägg, utökning till todos/rewards): verifierar
 * att Todo.title/rejectedReason och Reward.title faktiskt ligger krypterade i
 * MongoDB, och att API:et transparent dekrypterar tillbaka till klartext.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { RewardModel } from "../src/db/models/Reward.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("Todos/rewards title krypteras i databasen (ADR-0014 tillägg)", () => {
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
  let rewardId: string;

  const SECRET_TODO_TITLE = "Prata med barnpsykolog om ångest";
  const SECRET_REJECT_REASON = "Konfidentiell anledning";
  const SECRET_REWARD_TITLE = "Belöning kopplad till familjeterapi";

  it("registrerar användare och familjekonto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "todos-rewards-crypt-int@bmad.test", password: "Lösenord1!", name: "Krypteringstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Krypteringsfamiljen 2" });
    expect(setup.status).toBe(201);
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;
  });

  it("skapar ett todo med en känslig titel", async () => {
    todoId = `todo-crypt-${crypto.randomUUID()}`;
    const res = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId,
        title: SECRET_TODO_TITLE,
        createdBy: memberId,
        assignedTo: memberId,
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

  it("raw MongoDB-dokumentet för todot innehåller inte klartexten", async () => {
    const doc = await TodoModel.findOne({ id: todoId }).lean();
    expect(doc?.title).not.toBe(SECRET_TODO_TITLE);
    expect(doc?.title.startsWith("v1:")).toBe(true);
  });

  it("GET /api/todos returnerar klartext (dekryptering transparent)", async () => {
    const res = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const todo = (res.body as Array<{ id: string; title: string }>).find((t) => t.id === todoId);
    expect(todo?.title).toBe(SECRET_TODO_TITLE);
  });

  it("nekar todot med en känslig anledning — krypteras i databasen, dekrypteras i API-svaret", async () => {
    await request(app)
      .patch(`/api/todos/${todoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    const reject = await request(app)
      .patch(`/api/todos/${todoId}/reject`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ reason: SECRET_REJECT_REASON });
    expect(reject.status).toBe(200);

    const doc = await TodoModel.findOne({ id: todoId }).lean();
    expect(doc?.rejectedReason).not.toBe(SECRET_REJECT_REASON);
    expect(doc?.rejectedReason?.startsWith("v1:")).toBe(true);

    const res = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const todo = (res.body as Array<{ id: string; rejectedReason: string | null }>).find((t) => t.id === todoId);
    expect(todo?.rejectedReason).toBe(SECRET_REJECT_REASON);
  });

  it("skapar en belöning med en känslig titel", async () => {
    rewardId = `reward-crypt-${crypto.randomUUID()}`;
    const res = await request(app)
      .post("/api/rewards")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: rewardId,
        title: SECRET_REWARD_TITLE,
        wishedBy: memberId,
        starsNeeded: 10,
        status: "suggested",
        approvedBy: null,
        approvedAt: null,
        redeemedAt: null,
        deletedAt: null,
        deletedBy: null,
      });
    expect(res.status).toBe(201);
  });

  it("raw MongoDB-dokumentet för belöningen innehåller inte klartexten, API:et returnerar klartext", async () => {
    const doc = await RewardModel.findOne({ id: rewardId }).lean();
    expect(doc?.title).not.toBe(SECRET_REWARD_TITLE);
    expect(doc?.title.startsWith("v1:")).toBe(true);

    const res = await request(app)
      .get("/api/rewards")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const reward = (res.body as Array<{ id: string; title: string }>).find((r) => r.id === rewardId);
    expect(reward?.title).toBe(SECRET_REWARD_TITLE);
  });
});
