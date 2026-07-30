/**
 * Integrationstest: "Mina familjekonton" utökad (2026-07-29, Zaidas
 * önskemål: "jag behöver även kunna radera familjer som jag skapat och se
 * vilka som ingår i den, samt välja att överlåta den till någon annan
 * familjemedlem, samt gå ur familjen").
 *
 * Täcker membersService.ts (getMyMemberships/getMembersOfMyAccount/
 * leaveAccount) och accountsService.ts (transferAccountOwnership/
 * deleteMyCreatedAccount) — alla fyra slår upp anroparens medlemskap via
 * userId, inte via x-member-id/req.accountId, eftersom kontot i fråga inte
 * behöver vara det just nu AKTIVA (samma mönster som getMyMemberships sedan
 * 2026-07-25).
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

describe.skipIf(!RUN)("Mina familjekonton: radera/överlåt/gå ur", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let user1Token: string;
  let user2Token: string;
  let accountAId: string; // skapad av user1
  let accountBId: string; // skapad av user2, user1 bjuds in
  let user1MemberInA: string;
  let user3MemberInA: string; // inbjuden vuxen i A, mottagare av överlåtelse
  let user1MemberInB: string;

  it("bygger upp scenariot: user1 skapar konto A, user2 skapar konto B, user1 och user3 bjuds in", async () => {
    const reg1 = await request(app)
      .post("/api/auth/register")
      .send({ email: "membership-mgmt-user1@bmad.test", password: "Lösenord1!", name: "Ägare Ett" });
    expect(reg1.status).toBe(201);
    user1Token = reg1.body.accessToken as string;

    const setupA = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ name: "Familj A" });
    accountAId = setupA.body.membership.account.id;
    user1MemberInA = setupA.body.membership.member.id;

    const reg2 = await request(app)
      .post("/api/auth/register")
      .send({ email: "membership-mgmt-user2@bmad.test", password: "Lösenord1!", name: "Ägare Två" });
    user2Token = reg2.body.accessToken as string;

    const setupB = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${user2Token}`)
      .send({ name: "Familj B" });
    accountBId = setupB.body.membership.account.id;

    // Hämta Förälder-rollens id i respektive konto (behövs för invite-anropet).
    const rolesA = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${user1Token}`)
      .set("x-member-id", user1MemberInA);
    const parentRoleA = (rolesA.body as Array<{ id: string; name: string }>).find((r) => r.name === "Förälder")!.id;

    const rolesB = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${user2Token}`)
      .set("x-member-id", setupB.body.membership.member.id);
    const parentRoleB = (rolesB.body as Array<{ id: string; name: string }>).find((r) => r.name === "Förälder")!.id;

    // user1 bjuds in till konto B (blir INTE skapare där).
    const inviteToB = await request(app)
      .post(`/api/accounts/${accountBId}/invite`)
      .set("Authorization", `Bearer ${user2Token}`)
      .set("x-member-id", setupB.body.membership.member.id)
      .send({ invitedEmail: "membership-mgmt-user1@bmad.test", memberName: "Ägare Ett", roleId: parentRoleB });
    const acceptToB = await request(app)
      .post(`/api/invitations/${inviteToB.body.invitation.token}/accept`)
      .send({ action: "login", email: "membership-mgmt-user1@bmad.test", password: "Lösenord1!" });
    user1MemberInB = (acceptToB.body.memberships as Array<{ member: { id: string; accountId: string } }>).find(
      (m) => m.member.accountId === accountBId
    )!.member.id;

    // En tredje vuxen bjuds in till konto A (mottagare av överlåtelsen).
    const inviteToA = await request(app)
      .post(`/api/accounts/${accountAId}/invite`)
      .set("Authorization", `Bearer ${user1Token}`)
      .set("x-member-id", user1MemberInA)
      .send({ invitedEmail: "membership-mgmt-user3@bmad.test", memberName: "Vuxen Tre", roleId: parentRoleA });
    const acceptToA = await request(app)
      .post(`/api/invitations/${inviteToA.body.invitation.token}/accept`)
      .send({ action: "register", email: "membership-mgmt-user3@bmad.test", password: "Lösenord1!", name: "Vuxen Tre" });
    user3MemberInA = (acceptToA.body.memberships as Array<{ member: { id: string; accountId: string } }>).find(
      (m) => m.member.accountId === accountAId
    )!.member.id;

    expect(user1MemberInB).toBeTruthy();
    expect(user3MemberInA).toBeTruthy();
  });

  it("getMyMemberships visar isCreator/memberCount korrekt för user1 i båda konton", async () => {
    const res = await request(app).get("/api/members/my-memberships").set("Authorization", `Bearer ${user1Token}`);
    expect(res.status).toBe(200);
    const rows = res.body as Array<{ accountId: string; isCreator: boolean; memberCount: number }>;
    const rowA = rows.find((r) => r.accountId === accountAId)!;
    const rowB = rows.find((r) => r.accountId === accountBId)!;
    expect(rowA.isCreator).toBe(true);
    expect(rowA.memberCount).toBe(2);
    expect(rowB.isCreator).toBe(false);
    expect(rowB.memberCount).toBe(2);
  });

  it("ser vilka som ingår i konto A", async () => {
    const res = await request(app)
      .get(`/api/accounts/${accountAId}/members`)
      .set("Authorization", `Bearer ${user1Token}`);
    expect(res.status).toBe(200);
    const names = (res.body as Array<{ name: string }>).map((m) => m.name).sort();
    expect(names).toEqual(["Vuxen Tre", "Ägare Ett"].sort());
  });

  it("en utomstående (utan medlemskap i kontot) nekas att se medlemmar/gå ur/radera", async () => {
    const outsiderReg = await request(app)
      .post("/api/auth/register")
      .send({ email: "membership-mgmt-outsider@bmad.test", password: "Lösenord1!", name: "Utomstående" });
    const outsiderToken = outsiderReg.body.accessToken as string;

    const membersRes = await request(app)
      .get(`/api/accounts/${accountAId}/members`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(membersRes.status).toBe(403);

    const leaveRes = await request(app)
      .post(`/api/accounts/${accountAId}/leave`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(leaveRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/accounts/${accountAId}/as-creator`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(deleteRes.status).toBe(403);
  });

  it("user1 (inte skapare av B) kan gå ur konto B direkt", async () => {
    const res = await request(app)
      .post(`/api/accounts/${accountBId}/leave`)
      .set("Authorization", `Bearer ${user1Token}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const memberships = await request(app)
      .get("/api/members/my-memberships")
      .set("Authorization", `Bearer ${user1Token}`);
    expect((memberships.body as Array<{ accountId: string }>).some((m) => m.accountId === accountBId)).toBe(false);
  });

  it("user1 (skapare av A) nekas att gå ur A utan att först överlåta", async () => {
    const res = await request(app)
      .post(`/api/accounts/${accountAId}/leave`)
      .set("Authorization", `Bearer ${user1Token}`);
    expect(res.status).toBe(400);
  });

  it("nekar överlåtelse av A till ett barn", async () => {
    const rolesA = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${user1Token}`)
      .set("x-member-id", user1MemberInA);
    const childRoleId = (rolesA.body as Array<{ id: string; name: string }>).find((r) => r.name === "Barn")!.id;
    const childMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${user1Token}`)
      .set("x-member-id", user1MemberInA)
      .send({
        id: `member-test-child-${Date.now()}`,
        accountId: accountAId,
        name: "Barnet",
        roleId: childRoleId,
        isChild: true,
        avatarUrl: null,
        color: null,
        dashboardTheme: null
      });
    expect(childMember.status).toBe(201);

    const res = await request(app)
      .post(`/api/accounts/${accountAId}/transfer-ownership`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ newOwnerMemberId: childMember.body.id });
    expect(res.status).toBe(400);
  });

  it("user1 överlåter konto A till user3, kan sedan gå ur", async () => {
    const membersOfA = await request(app)
      .get(`/api/accounts/${accountAId}/members`)
      .set("Authorization", `Bearer ${user1Token}`);
    const user3Row = (membersOfA.body as Array<{ id: string; isChild: boolean }>).find((m) => m.id === user3MemberInA);
    expect(user3Row, `user3MemberInA (${user3MemberInA}) hittades inte bland A:s medlemmar: ${JSON.stringify(membersOfA.body)}`).toBeTruthy();
    expect(user3Row!.isChild).toBe(false);

    const transfer = await request(app)
      .post(`/api/accounts/${accountAId}/transfer-ownership`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ newOwnerMemberId: user3MemberInA });
    expect(transfer.status, JSON.stringify(transfer.body)).toBe(200);

    const memberships = await request(app)
      .get("/api/members/my-memberships")
      .set("Authorization", `Bearer ${user1Token}`);
    const rowA = (memberships.body as Array<{ accountId: string; isCreator: boolean }>).find(
      (m) => m.accountId === accountAId
    )!;
    expect(rowA.isCreator).toBe(false);

    const leave = await request(app)
      .post(`/api/accounts/${accountAId}/leave`)
      .set("Authorization", `Bearer ${user1Token}`);
    expect(leave.status).toBe(200);
  });

  it("user3 (nu ende medlemmen och skaparen av A) kan inte gå ur, men kan radera familjen", async () => {
    const user3Login = await request(app)
      .post("/api/auth/login")
      .send({ email: "membership-mgmt-user3@bmad.test", password: "Lösenord1!" });
    const user3Token = user3Login.body.accessToken as string;

    const leaveAttempt = await request(app)
      .post(`/api/accounts/${accountAId}/leave`)
      .set("Authorization", `Bearer ${user3Token}`);
    expect(leaveAttempt.status, JSON.stringify(leaveAttempt.body)).toBe(400);

    const deleteAttemptByOutsider = await request(app)
      .delete(`/api/accounts/${accountAId}/as-creator`)
      .set("Authorization", `Bearer ${user2Token}`);
    expect(deleteAttemptByOutsider.status).toBe(403);

    const del = await request(app)
      .delete(`/api/accounts/${accountAId}/as-creator`)
      .set("Authorization", `Bearer ${user3Token}`);
    expect(del.status).toBe(200);

    const account = await request(app).get(`/api/accounts/${accountAId}`);
    expect(account.body.deletedAt).not.toBeNull();
  });
});
