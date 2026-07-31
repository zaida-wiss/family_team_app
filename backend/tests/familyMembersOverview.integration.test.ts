/**
 * Integrationstest (2026-07-31, Zaidas önskemål: "om jag väljer en familj,
 * då vill jag att endast den familjens kalenderhändelser, todos och
 * medlemmar visas... möjlighet att välja samtliga familjer") — Hem-vyns nya
 * familjefilter behöver veta VILKA medlemmar som hör till en delad familj,
 * inte bara kalendrar/todos. GET /api/members/cross-account (samma person,
 * flera egna medlemskap) och GET /api/members/connections
 * (Familjeanslutningar) — mirror av crossAccountCalendars.integration.test.ts
 * respektive familyConnectionCalendars.integration.test.ts, fast för
 * medlemslistan.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import crypto from "crypto";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

async function registerFamily(email: string, accountName: string, parentName = "Förälder") {
  const register = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Lösenord1!", name: parentName });
  const accessToken = register.body.accessToken as string;

  const setup = await request(app)
    .post("/api/accounts/setup")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: accountName });
  const parentMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;
  const accountId = (setup.body as { membership: { account: { id: string } } }).membership.account.id;

  return { accessToken, parentMemberId, accountId, email };
}

describe.skipIf(!RUN)("Hem-vyns familjefilter: GET /api/members/cross-account", () => {
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

  it("en och samma användare skapar två egna familjekonton", async () => {
    const email = `dubbelkonto-medlem-${crypto.randomUUID()}@bmad.test`;
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "Losenord1!", name: "Zaida" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setupA = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Familj A" });
    accountA = {
      memberId: setupA.body.membership.member.id as string,
      accountId: setupA.body.membership.member.accountId as string
    };

    const setupB = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Familj B" });
    accountB = {
      memberId: setupB.body.membership.member.id as string,
      accountId: setupB.body.membership.member.accountId as string
    };
    expect(accountA.accountId).not.toBe(accountB.accountId);
  });

  it("GET /api/members/cross-account (från konto A) visar konto B:s medlemmar, grupperat med accountName", async () => {
    const res = await request(app)
      .get("/api/members/cross-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accountId).toBe(accountB.accountId);
    expect(res.body[0].accountName).toBe("Familj B");
    expect(res.body[0].members).toHaveLength(1);
    expect(res.body[0].members[0].id).toBe(accountB.memberId);
  });

  it("avmarkerar konto B (hiddenCrossAccountIds) — döljer det ur medlemsvyn också", async () => {
    const hide = await request(app)
      .patch(`/api/members/${accountA.memberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({ hiddenCrossAccountIds: [accountB.accountId] });
    expect(hide.status).toBe(200);

    const hidden = await request(app)
      .get("/api/members/cross-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(hidden.body).toEqual([]);
  });
});

describe.skipIf(!RUN)("Hem-vyns familjefilter: GET /api/members/connections", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let familyA: Awaited<ReturnType<typeof registerFamily>>;
  let familyB: Awaited<ReturnType<typeof registerFamily>>;
  let familyC: Awaited<ReturnType<typeof registerFamily>>;

  it("sätter upp tre familjer, A ansluter till B och exponerar sig själv", async () => {
    familyA = await registerFamily(`famconn-mem-a-${crypto.randomUUID()}@bmad.test`, "Familj A", "Moa");
    familyB = await registerFamily(`famconn-mem-b-${crypto.randomUUID()}@bmad.test`, "Familj B");
    familyC = await registerFamily(`famconn-mem-c-${crypto.randomUUID()}@bmad.test`, "Familj C");

    const invite = await request(app)
      .post(`/api/accounts/${familyA.accountId}/family-connections`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        otherAccountId: familyB.accountId,
        exposedMemberIds: [familyA.parentMemberId],
        access: "view",
        dataScope: { todos: false, recipes: false, shoppingLists: false, calendars: false }
      });
    expect(invite.status).toBe(201);

    const accept = await request(app)
      .post(`/api/accounts/${familyB.accountId}/family-connections/pending/${familyA.accountId}/accept`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({
        exposedMemberIds: [],
        access: "view",
        dataScope: { todos: false, recipes: false, shoppingLists: false, calendars: false }
      });
    expect(accept.status).toBe(200);
  });

  it("B ser A:s exponerade medlem (Moa) via GET /api/members/connections", async () => {
    const res = await request(app)
      .get("/api/members/connections")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accountId).toBe(familyA.accountId);
    expect(res.body[0].accountName).toBe("Familj A");
    expect(res.body[0].members).toHaveLength(1);
    expect(res.body[0].members[0].name).toBe("Moa");
  });

  it("A ser INGET av B (B exponerade inga medlemmar)", async () => {
    const res = await request(app)
      .get("/api/members/connections")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("en helt orelaterad tredje familj ser ingenting", async () => {
    const res = await request(app)
      .get("/api/members/connections")
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
