/**
 * Integrationstester för att köp av belöningar valideras på servern —
 * inte bara i frontend. Regressionsskydd mot ADR-0002 (broken access control:
 * kategorispärr + stjärnsaldo kontrollerades tidigare enbart i klienten).
 * Utökad 2026-08-28 (Sprint 10 S1, samma ADR-0002-klass) med ett test för att
 * ett datum-/tids-/veckodagsfönster (RewardShopItem.availability) nu också
 * kontrolleras server-side vid purchaseItem(), inte bara i shopAvailability.ts.
 * Utökad igen 2026-08-29 med ett test för köpgränsen (RewardShopItem.
 * purchaseLimit) — se countPurchasesInCurrentPeriod i rewardShopService.ts.
 * Utökad ytterligare en gång samma dag med ett test för "en tidtagen
 * belöning i taget" (getActiveTimedReward) — ett nytt köp (av VILKEN vara
 * som helst) ska nekas medan en tidigare köpt tidtagen belöning fortfarande
 * pågår.
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
        purchaseLimit: null,
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
        purchaseLimit: null,
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

  it("nekar köp med 409 om varans tillgänglighetsfönster inte har startat än — trots att frontend inte frågats", async () => {
    const itemId = `item-${crypto.randomUUID()}`;
    const addItem = await request(app)
      .post("/api/reward-shop/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: itemId,
        title: "Framtida belöning",
        symbol: null,
        starCost: 1,
        timerMinutes: null,
        availability: { startDate: "2099-01-01", endDate: null, windows: [] },
        purchaseLimit: null,
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

  it("nekar ett andra köp med 409 när köpgränsen (purchaseLimit) redan är nådd för perioden", async () => {
    // Ge medlemmen tillräckligt med stjärnor för två köp.
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

    const itemId = `item-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/reward-shop/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: itemId,
        title: "Max en gång per dag",
        symbol: null,
        starCost: 1,
        timerMinutes: null,
        availability: null,
        purchaseLimit: { max: 1, period: "day" },
        requiredCategories: [],
        createdBy: memberId,
        deletedAt: null,
      });

    const firstPurchase = await request(app)
      .post(`/api/reward-shop/purchase/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(firstPurchase.status).toBe(200);

    const secondPurchase = await request(app)
      .post(`/api/reward-shop/purchase/${itemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(secondPurchase.status).toBe(409);
  });

  it("nekar ETT NYTT köp (av VILKEN vara som helst) medan en tidigare tidtagen belöning fortfarande pågår", async () => {
    // Ge medlemmen tillräckligt med stjärnor för två köp.
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

    const timedItemId = `item-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/reward-shop/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: timedItemId, title: "Skärmtid", symbol: null, starCost: 1, timerMinutes: 30,
        availability: null, purchaseLimit: null, requiredCategories: [], createdBy: memberId, deletedAt: null,
      });

    const otherItemId = `item-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/reward-shop/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: otherItemId, title: "Godis", symbol: null, starCost: 1, timerMinutes: null,
        availability: null, purchaseLimit: null, requiredCategories: [], createdBy: memberId, deletedAt: null,
      });

    const firstPurchase = await request(app)
      .post(`/api/reward-shop/purchase/${timedItemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(firstPurchase.status).toBe(200);

    // En HELT ANNAN, otidsatt vara ska OCKSÅ blockeras — spärren gäller
    // "en tidtagen belöning i taget" oavsett vad man försöker köpa härnäst.
    const secondPurchase = await request(app)
      .post(`/api/reward-shop/purchase/${otherItemId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({});
    expect(secondPurchase.status).toBe(409);
    expect(secondPurchase.body.error).toContain("Skärmtid");

    const status = await request(app)
      .get(`/api/reward-shop/active-timed-reward/${memberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(status.status).toBe(200);
    expect(status.body.itemTitle).toBe("Skärmtid");
    expect(status.body.remainingMinutes).toBeGreaterThan(0);
  });
});
