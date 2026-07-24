/**
 * Integrationstest (2026-07-25): Hushållets lösenord + abonnemang. ENDAST
 * vuxna (både läsning och skrivning, till skillnad från Recept) — verifierar
 * kryptering vid lagring (rå MongoDB-läsning innehåller aldrig klartext),
 * korrekt dekryptering vid läsning via API, kontoscopning, OCH att fälten
 * ALDRIG dyker upp i GDPR-exporten (samma princip som ADR-0027:s
 * CalDAV-lösenord).
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";
import { HouseholdSecretModel } from "../src/db/models/HouseholdSecret.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("Hushållets lösenord + abonnemang", () => {
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
  let secretId: string;

  it("registrerar användare, familjekonto, ett barn i samma konto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `household-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Hushållstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Hushållsfamiljen" });
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

  it("ett barn kan INTE skapa eller ens LÄSA hushållets lösenord", async () => {
    const create = await request(app)
      .post("/api/household-secrets")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ kind: "password", title: "WiFi", username: null, secret: "hemligt123", notes: null, cost: null, renewalDate: null });
    expect(create.status).toBe(403);

    const list = await request(app)
      .get("/api/household-secrets")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId);
    expect(list.status).toBe(403);
  });

  it("en vuxen skapar ett lösenord — svaret innehåller rätt dekrypterat värde", async () => {
    const res = await request(app)
      .post("/api/household-secrets")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ kind: "password", title: "WiFi", username: "familjen", secret: "hemligt123", notes: "Sitter på routern", cost: null, renewalDate: null });
    expect(res.status).toBe(201);
    expect(res.body.secret).toBe("hemligt123");
    expect(res.body.username).toBe("familjen");
    secretId = res.body.id;
  });

  it("rådata i MongoDB innehåller ALDRIG lösenordet i klartext", async () => {
    const raw = await HouseholdSecretModel.findOne({ id: secretId }).lean();
    expect(raw?.secretEnc).not.toContain("hemligt123");
    expect(raw?.secretEnc?.startsWith("v1:")).toBe(true);
    expect(raw?.username).not.toBe("familjen");
  });

  it("en vuxen läser listan och får korrekt dekrypterat lösenord tillbaka", async () => {
    const res = await request(app)
      .get("/api/household-secrets")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].secret).toBe("hemligt123");
  });

  it("skapar ett abonnemang med kostnad och förnyelsedatum", async () => {
    const res = await request(app)
      .post("/api/household-secrets")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ kind: "subscription", title: "Netflix", username: null, secret: "familj@example.com", notes: null, cost: 149, renewalDate: "2026-08-01" });
    expect(res.status).toBe(201);
    expect(res.body.cost).toBe(149);
    expect(res.body.renewalDate).toBe("2026-08-01");
  });

  it("GDPR-exporten innehåller ALDRIG lösenordet, varken krypterat eller i klartext", async () => {
    const res = await request(app)
      .get(`/api/accounts/${accountId}/export`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("hemligt123");
    expect(raw).not.toContain("secretEnc");
    expect(raw).not.toContain("WiFi");
    expect(raw).not.toContain("Netflix");
  });

  it("tomt lösenord/uppgift avvisas", async () => {
    const res = await request(app)
      .post("/api/household-secrets")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ kind: "password", title: "Tomt", username: null, secret: "  ", notes: null, cost: null, renewalDate: null });
    expect(res.status).toBe(400);
  });

  it("ett annat konto ser inga hushållsuppgifter alls (kontoscopning)", async () => {
    const otherRegister = await request(app)
      .post("/api/auth/register")
      .send({ email: `household-other-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Annan familj" });
    const otherToken = otherRegister.body.accessToken as string;
    const otherSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: "Den andra familjen" });
    const otherMemberId = otherSetup.body.membership.member.id as string;

    const res = await request(app)
      .get("/api/household-secrets")
      .set("Authorization", `Bearer ${otherToken}`)
      .set("x-member-id", otherMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
