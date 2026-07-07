/**
 * Integrationstester för att köp av belöningar valideras på servern —
 * inte bara i frontend. Regressionsskydd mot ADR-0002 (broken access control:
 * kategorispärr + stjärnsaldo kontrollerades tidigare enbart i klienten).
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

describe.skipIf(!RUN)("Belöningsköp valideras server-side", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;

  it("registrerar användare och familjekonto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "reward-int@bmad.test", password: "Lösenord1!", name: "Belöningstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Belöningsfamiljen" });
    expect(setup.status).toBe(201);
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;
  });

  it("nekar köp med 409 om medlemmen inte har råd — trots att frontend inte frågats", async () => {
    const itemId = `item-${crypto.randomUUID()}`;
    const addItem = await request(app)
      .post("/api/reward-shop/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: itemId,
        title: "För dyr belöning",
        symbol: null,
        starCost: 100,
        timerMinutes: null,
        availability: null,
        requiredCategories: [],
        createdBy: memberId,
        deletedAt: null,
      });
    expect(addItem.status).toBe(201);

    const purchase = await request(app)
      .post(`/api/reward-shop/purchase/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(purchase.status).toBe(409);
  });

  it("nekar köp med 409 om ett obligatoriskt kategori-uppdrag fortfarande är pending", async () => {
    // Ge medlemmen tillräckligt med stjärnor via ett godkänt (icke-kategoriserat) uppdrag.
    const starTodoId = `todo-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: starTodoId,
        title: "Tjäna stjärnor",
        createdBy: memberId,
        assignedTo: memberId,
        isShared: false,
        status: "pending",
        starValue: 10,
        visual: { type: "lucide-icon", value: "Star" },
        recurrence: { type: "none" },
        recurringSourceId: null,
        occurrenceDate: null,
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
    await request(app)
      .patch(`/api/todos/${starTodoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    await request(app)
      .patch(`/api/todos/${starTodoId}/approve`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});

    // En riktig kategori (ADR-0020 — ersätter det tidigare fasta
    // routineCategory-namnet "Hälsa" med en vanlig, kontobred TodoCategory).
    const category = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Hälsa" });
    const categoryId = (category.body as { id: string }).id;

    // Ett obligatoriskt kategori-uppdrag som ännu inte är avklarat.
    const categoryTodoId = `todo-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: categoryTodoId,
        title: "Städa rummet",
        createdBy: memberId,
        assignedTo: memberId,
        isShared: false,
        status: "pending",
        starValue: 1,
        visual: { type: "lucide-icon", value: "Star" },
        recurrence: { type: "none" },
        recurringSourceId: null,
        occurrenceDate: null,
        visibleFrom: null,
        expiresAt: null,
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        deletedAt: null,
        deletedBy: null,
        personalCategoryId: categoryId,
      });

    const itemId = `item-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/reward-shop/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: itemId,
        title: "Kategorilåst belöning",
        symbol: null,
        starCost: 5,
        timerMinutes: null,
        availability: null,
        requiredCategories: [categoryId],
        createdBy: memberId,
        deletedAt: null,
      });

    const purchase = await request(app)
      .post(`/api/reward-shop/purchase/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(purchase.status).toBe(409);
  });
});
