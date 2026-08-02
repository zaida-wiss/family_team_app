/**
 * Integrationstest (2026-07-25, Zaidas önskemål: "du skall se vilka familjer
 * du är med i... dyka upp på ställen som todo som familjen vid rätt namn").
 *
 * Skiljer sig från childShares.integration.test.ts (ADR-0024, en delnings-
 * GRANT från någon annan) — det här är EN OCH SAMMA användares egna, riktiga
 * medlemskap i FLERA konton (samma flöde som "Skapa nytt familjekonto" i
 * AccountPicker.tsx: /api/accounts/setup kan anropas flera gånger med samma
 * inloggning).
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

describe.skipIf(!RUN)("Mina familjekonton — todo utan tilldelad mottagare över flera EGNA medlemskap", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let accountA: { memberId: string; accountId: string };
  let accountB: { memberId: string; accountId: string };
  let outsiderToken: string;
  let outsiderMemberId: string;
  let familyTodoId: string;

  it("en och samma användare skapar två separata familjekonton", async () => {
    const email = `dubbelkonto-${crypto.randomUUID()}@bmad.test`;
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Losenord1!", name: "Zaida" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setupA = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Familj A" });
    expect(setupA.status).toBe(201);
    accountA = {
      memberId: setupA.body.membership.member.id as string,
      accountId: setupA.body.membership.member.accountId as string
    };

    const setupB = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Familj B" });
    expect(setupB.status).toBe(201);
    accountB = {
      memberId: setupB.body.membership.member.id as string,
      accountId: setupB.body.membership.member.accountId as string
    };
    expect(accountA.accountId).not.toBe(accountB.accountId);

    const outsider = await request(app)
      .post("/api/auth/register")
      .send({ email: `utomstaende-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Utomstående" });
    outsiderToken = outsider.body.accessToken as string;
    const outsiderSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ name: "Familj C" });
    outsiderMemberId = outsiderSetup.body.membership.member.id as string;
  });

  it("GET /api/members/my-memberships listar båda mina konton med rätt namn", async () => {
    const res = await request(app)
      .get("/api/members/my-memberships")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(res.status).toBe(200);
    const names = (res.body as Array<{ accountId: string; accountName: string }>).map((m) => m.accountName).sort();
    expect(names).toEqual(["Familj A", "Familj B"]);
  });

  it("en Familjen-uppgift (assignedTo: null) i konto B syns i konto A:s cross-account-vy, med kontots namn", async () => {
    familyTodoId = `todo-family-${crypto.randomUUID()}`;
    const create = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountB.memberId)
      .send({
        id: familyTodoId, title: "Handla mat", createdBy: accountB.memberId, assignedTo: null,
        accountId: accountB.accountId, ...todoPayload({})
      });
    expect(create.status).toBe(201);

    const res = await request(app)
      .get("/api/todos/family-across-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accountName).toBe("Familj B");
    expect(res.body[0].todos.map((t: { id: string }) => t.id)).toContain(familyTodoId);
  });

  it("en helt orelaterad utomstående ser ingenting", async () => {
    const res = await request(app)
      .get("/api/todos/family-across-accounts")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .set("x-member-id", outsiderMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("avmarkerar konto B (hiddenCrossAccountIds) — döljer det ur vyn utan att lämna kontot", async () => {
    const hide = await request(app)
      .patch(`/api/members/${accountA.memberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({ hiddenCrossAccountIds: [accountB.accountId] });
    expect(hide.status).toBe(200);

    const hidden = await request(app)
      .get("/api/todos/family-across-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(hidden.body).toEqual([]);

    // Jag är fortfarande medlem — my-memberships-listan opåverkad.
    const memberships = await request(app)
      .get("/api/members/my-memberships")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(memberships.body).toHaveLength(2);

    // Markera synlig igen för resten av testerna.
    await request(app)
      .patch(`/api/members/${accountA.memberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({ hiddenCrossAccountIds: [] });
  });

  it("markerar den delade Familjen-uppgiften klar från konto A — sparas i konto B (min riktiga medlemspost där)", async () => {
    const complete = await request(app)
      .patch(`/api/todos/family-across-accounts/${accountB.accountId}/${familyTodoId}/complete`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({});
    expect(complete.status).toBe(200);

    const inAccountB = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountB.memberId);
    const saved = (inAccountB.body as Array<{ id: string; status: string }>).find((t) => t.id === familyTodoId)!;
    expect(saved.status).toBe("approved");
  });

  it("en utomstående utan medlemskap i konto B kan INTE slutföra en av dess Familjen-uppgifter", async () => {
    const otherTodoId = `todo-family-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountB.memberId)
      .send({
        id: otherTodoId, title: "Diska", createdBy: accountB.memberId, assignedTo: null,
        accountId: accountB.accountId, ...todoPayload({})
      });

    const res = await request(app)
      .patch(`/api/todos/family-across-accounts/${accountB.accountId}/${otherTodoId}/complete`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .set("x-member-id", outsiderMemberId)
      .send({});
    expect(res.status).toBe(403);
  });

  // 2026-08-01, Zaidas önskemål: "kunna lägga till nya todos som är
  // förinställda på den aktuella familjen", rättad samma dag: "signa upp
  // sig... samma gester som todovyn" — ersätter den ursprungliga
  // Ta uppgiften/Släpp-mekanismen (assignedTo-claim) med samma
  // "vem håller på med den här"-in-progress-toggle som redan finns lokalt.
  it("skapar en ny Familjen-uppgift direkt i konto B från konto A, sedan signar/lämnar den (in-progress)", async () => {
    const create = await request(app)
      .post(`/api/todos/family-across-accounts/${accountB.accountId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({ title: "Handla mjölk", visual: "🥛" });
    expect(create.status).toBe(201);
    const newTodoId = create.body.id as string;

    const listed = await request(app)
      .get("/api/todos/family-across-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    const bTodos = (listed.body as Array<{ accountId: string; myMemberId: string; todos: Array<{ id: string; inProgressBy: string[] }> }>).find(
      (t) => t.accountId === accountB.accountId
    )!;
    expect(bTodos.todos.find((t) => t.id === newTodoId)?.inProgressBy).toEqual([]);
    // myMemberId är min RIKTIGA, egna medlemspost I KONTO B — en helt separat
    // Member-dokument/id från accountA.memberId (samma användare, men varje
    // konto får sin egen medlemspost med sitt eget id).
    const myMemberIdInB = bTodos.myMemberId;
    expect(myMemberIdInB).not.toBe(accountA.memberId);

    const signUp = await request(app)
      .patch(`/api/todos/family-across-accounts/${accountB.accountId}/${newTodoId}/in-progress`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({ targetMemberId: myMemberIdInB });
    expect(signUp.status).toBe(200);
    expect(signUp.body.inProgressBy).toEqual([myMemberIdInB]);

    const afterSignUp = await request(app)
      .get("/api/todos/family-across-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    const bTodosSignedUp = (afterSignUp.body as Array<{ accountId: string; todos: Array<{ id: string; inProgressBy: string[] }> }>).find(
      (t) => t.accountId === accountB.accountId
    )!;
    expect(bTodosSignedUp.todos.find((t) => t.id === newTodoId)?.inProgressBy).toEqual([myMemberIdInB]);

    // En utomstående (ingen riktig medlemspost i konto B) kan inte signa upp
    // sig alls — nekas oavsett att in-progress i sig tillåter flera personer.
    const outsiderSignUp = await request(app)
      .patch(`/api/todos/family-across-accounts/${accountB.accountId}/${newTodoId}/in-progress`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .set("x-member-id", outsiderMemberId)
      .send({ targetMemberId: outsiderMemberId });
    expect(outsiderSignUp.status).toBe(403);

    // Samma dubbeltryck-toggle en gång till tar bort mig igen (Släpp).
    const leave = await request(app)
      .patch(`/api/todos/family-across-accounts/${accountB.accountId}/${newTodoId}/in-progress`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({ targetMemberId: myMemberIdInB });
    expect(leave.status).toBe(200);
    expect(leave.body.inProgressBy).toEqual([]);

    const afterLeave = await request(app)
      .get("/api/todos/family-across-accounts")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    const bTodosLeft = (afterLeave.body as Array<{ accountId: string; todos: Array<{ id: string; inProgressBy: string[] }> }>).find(
      (t) => t.accountId === accountB.accountId
    )!;
    expect(bTodosLeft.todos.find((t) => t.id === newTodoId)?.inProgressBy).toEqual([]);
  });

  it("en utomstående utan medlemskap i konto B kan INTE skapa en Familjen-uppgift där", async () => {
    const res = await request(app)
      .post(`/api/todos/family-across-accounts/${accountB.accountId}`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .set("x-member-id", outsiderMemberId)
      .send({ title: "Otillåten uppgift" });
    expect(res.status).toBe(403);
  });
});
