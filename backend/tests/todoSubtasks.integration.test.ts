/**
 * Integrationstest (Sprint 6 S1): verifierar att en todo kan skapas med
 * delmoment, att PATCH /api/todos/:id/subtasks/:subtaskId bockar av/på ett
 * enskilt delmoment oberoende av de andra, är kontoscopad, och att status
 * på övriga delmoment/todon inte påverkas.
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

describe.skipIf(!RUN)("Todo-delmoment", () => {
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
  const subtaskA = "subtask-a";
  const subtaskB = "subtask-b";

  it("registrerar användare och familjekonto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "subtasks-int@bmad.test", password: "Lösenord1!", name: "Delmomentstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Delmomentsfamiljen" });
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;
  });

  it("skapar ett todo med två delmoment", async () => {
    todoId = `todo-subtasks-${crypto.randomUUID()}`;
    const res = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId,
        title: "Städa rummet",
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
        subtasks: [
          { id: subtaskA, title: "Plocka undan leksaker", done: false },
          { id: subtaskB, title: "Dammsug golvet", done: false }
        ]
      });
    expect(res.status).toBe(201);
  });

  it("bockar av ett delmoment utan att påverka det andra", async () => {
    const toggle = await request(app)
      .patch(`/api/todos/${todoId}/subtasks/${subtaskA}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(toggle.status).toBe(200);
    expect(toggle.body).toEqual({ done: true });

    const list = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const todo = (list.body as Array<{ id: string; subtasks: Array<{ id: string; done: boolean }> }>).find(
      (t) => t.id === todoId
    );
    expect(todo?.subtasks.find((s) => s.id === subtaskA)?.done).toBe(true);
    expect(todo?.subtasks.find((s) => s.id === subtaskB)?.done).toBe(false);
  });

  it("bockar tillbaka samma delmoment (togglar av igen)", async () => {
    const toggle = await request(app)
      .patch(`/api/todos/${todoId}/subtasks/${subtaskA}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(toggle.status).toBe(200);
    expect(toggle.body).toEqual({ done: false });
  });

  it("404 om delmomentet inte finns", async () => {
    const res = await request(app)
      .patch(`/api/todos/${todoId}/subtasks/finns-inte`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(res.status).toBe(404);
  });

  it("ett annat konto kan inte bocka av delmomentet (kontoscopning)", async () => {
    const otherRegister = await request(app)
      .post("/api/auth/register")
      .send({ email: "subtasks-other-int@bmad.test", password: "Lösenord1!", name: "Annan förälder" });
    const otherToken = otherRegister.body.accessToken as string;
    const otherSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: "Andra familjen" });
    const otherMemberId = (otherSetup.body as { membership: { member: { id: string } } }).membership.member.id;

    const res = await request(app)
      .patch(`/api/todos/${todoId}/subtasks/${subtaskB}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .set("x-member-id", otherMemberId)
      .send({});
    expect(res.status).toBe(404);
  });
});
