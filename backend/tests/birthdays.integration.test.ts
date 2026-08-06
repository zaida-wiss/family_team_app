/**
 * Integrationstest (2026-08-06): Födelsedagslista. Samma kontobreda,
 * vuxen-bara mönster (både läsning och skrivning) som Hushållets lösenord —
 * verifierar CRUD, adult-only-gating, kontoscopning, OCH delning via
 * Familjeanslutningar (ADR-0030, dataScope.birthdays).
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

describe.skipIf(!RUN)("Födelsedagslista", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let accountId: string;
  let memberId: string;
  let childMemberId: string;
  let birthdayId: string;

  it("registrerar användare, familjekonto, ett barn i samma konto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `birthday-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Födelsedagstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Födelsedagsfamiljen" });
    memberId = setup.body.membership.member.id as string;
    accountId = setup.body.membership.member.accountId as string;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;

    const childMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Barnet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    childMemberId = childMember.body.id as string;
  });

  it("ett barn kan INTE skapa eller ens LÄSA födelsedagslistan", async () => {
    const create = await request(app)
      .post("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ name: "Mormor", month: 5, day: 12, year: 1958 });
    expect(create.status).toBe(403);

    const list = await request(app)
      .get("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId);
    expect(list.status).toBe(403);
  });

  it("en vuxen skapar en födelsedag", async () => {
    const res = await request(app)
      .post("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Mormor", month: 5, day: 12, year: 1958 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Mormor");
    expect(res.body.month).toBe(5);
    expect(res.body.day).toBe(12);
    expect(res.body.year).toBe(1958);
    birthdayId = res.body.id;
  });

  it("en vuxen skapar en till, utan angivet år", async () => {
    const res = await request(app)
      .post("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Farfar", month: 11, day: 3, year: null });
    expect(res.status).toBe(201);
    expect(res.body.year).toBeNull();
  });

  it("en vuxen läser listan och ser båda", async () => {
    const res = await request(app)
      .get("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("ogiltig månad/dag avvisas", async () => {
    const badMonth = await request(app)
      .post("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Fel", month: 13, day: 1, year: null });
    expect(badMonth.status).toBe(400);

    const badDay = await request(app)
      .post("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Fel", month: 1, day: 32, year: null });
    expect(badDay.status).toBe(400);

    const emptyName = await request(app)
      .post("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "  ", month: 1, day: 1, year: null });
    expect(emptyName.status).toBe(400);
  });

  it("en vuxen uppdaterar en födelsedag", async () => {
    const res = await request(app)
      .patch(`/api/birthdays/${birthdayId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Mormor Kerstin", month: 5, day: 12, year: 1958 });
    expect(res.status).toBe(200);

    const list = await request(app)
      .get("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body.find((b: { id: string }) => b.id === birthdayId).name).toBe("Mormor Kerstin");
  });

  it("ett barn kan inte heller uppdatera/radera", async () => {
    const patch = await request(app)
      .patch(`/api/birthdays/${birthdayId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ name: "Hackad", month: 1, day: 1, year: null });
    expect(patch.status).toBe(403);

    const del = await request(app)
      .delete(`/api/birthdays/${birthdayId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId);
    expect(del.status).toBe(403);
  });

  it("en vuxen raderar en födelsedag — den försvinner ur listan (mjuk radering)", async () => {
    const del = await request(app)
      .delete(`/api/birthdays/${birthdayId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get("/api/birthdays")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe("Farfar");
  });

  it("ett annat konto ser inga födelsedagar alls (kontoscopning)", async () => {
    const otherRegister = await request(app)
      .post("/api/auth/register")
      .send({ email: `birthday-other-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Annan familj" });
    const otherToken = otherRegister.body.accessToken as string;
    const otherSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: "Den andra familjen" });
    const otherMemberId = otherSetup.body.membership.member.id as string;

    const res = await request(app)
      .get("/api/birthdays")
      .set("Authorization", `Bearer ${otherToken}`)
      .set("x-member-id", otherMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

async function registerFamily(email: string, accountName: string) {
  const register = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "Lösenord1!", name: "Förälder" });
  const accessToken = register.body.accessToken as string;

  const setup = await request(app)
    .post("/api/accounts/setup")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: accountName });
  const parentMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;
  const accId = (setup.body as { membership: { account: { id: string } } }).membership.account.id;

  return { accessToken, parentMemberId, accountId: accId, email };
}

describe.skipIf(!RUN)("ADR-0030-tillägg: Familjeanslutningar delar födelsedagar", () => {
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

  it("sätter upp tre familjer, A lägger till en födelsedag", async () => {
    familyA = await registerFamily(`famconn-bday-a-${crypto.randomUUID()}@bmad.test`, "Familj A");
    familyB = await registerFamily(`famconn-bday-b-${crypto.randomUUID()}@bmad.test`, "Familj B");
    familyC = await registerFamily(`famconn-bday-c-${crypto.randomUUID()}@bmad.test`, "Familj C");

    const create = await request(app)
      .post("/api/birthdays")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ name: "Moster Anna", month: 9, day: 20, year: 1975 });
    expect(create.status).toBe(201);
  });

  it("A ansluter till B med dataScope.birthdays på (övriga avstängda)", async () => {
    const invite = await request(app)
      .post(`/api/accounts/${familyA.accountId}/family-connections`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        otherAccountId: familyB.accountId,
        exposedMemberIds: [familyA.parentMemberId],
        access: "view",
        dataScope: { todos: false, recipes: false, shoppingLists: false, calendars: false, birthdays: true }
      });
    expect(invite.status).toBe(201);

    const accept = await request(app)
      .post(`/api/accounts/${familyB.accountId}/family-connections/pending/${familyA.accountId}/accept`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({
        exposedMemberIds: [familyB.parentMemberId],
        access: "view",
        dataScope: { todos: false, recipes: false, shoppingLists: false, calendars: false, birthdays: false }
      });
    expect(accept.status).toBe(200);
  });

  it("B ser A:s delade födelsedag via GET /api/birthdays/connections", async () => {
    const res = await request(app)
      .get("/api/birthdays/connections")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accountName).toBe("Familj A");
    expect(res.body[0].birthdays).toHaveLength(1);
    expect(res.body[0].birthdays[0].name).toBe("Moster Anna");
  });

  it("A ser INGET av B:s födelsedagar (B accepterade med dataScope.birthdays: false)", async () => {
    const res = await request(app)
      .get("/api/birthdays/connections")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("en helt orelaterad tredje familj ser ingenting", async () => {
    const res = await request(app)
      .get("/api/birthdays/connections")
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
