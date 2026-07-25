/**
 * Integrationstest (2026-07-25): Extra 6-siffrig kod för Hushåll-kategorin.
 * Adult-only (både sätta och verifiera), rätt/fel kod, ogiltigt format,
 * kontoscopning.
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

describe.skipIf(!RUN)("Hushåll-kategorins extra kod", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let childMemberId: string;

  it("registrerar användare, familjekonto, ett barn i samma konto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `pin-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Kodtest" });
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Kodfamiljen" });
    memberId = setup.body.membership.member.id as string;

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

  it("ingen kod satt än — status isSet:false, ett barn kan inte ens läsa statusen", async () => {
    const status = await request(app)
      .get("/api/household-pin")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(status.status).toBe(200);
    expect(status.body.isSet).toBe(false);

    const childStatus = await request(app)
      .get("/api/household-pin")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId);
    expect(childStatus.status).toBe(403);
  });

  it("ogiltigt format (inte 6 siffror) avvisas", async () => {
    const res = await request(app)
      .put("/api/household-pin")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ pin: "123" });
    expect(res.status).toBe(400);
  });

  it("en vuxen sätter koden, status blir isSet:true", async () => {
    const set = await request(app)
      .put("/api/household-pin")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ pin: "482913" });
    expect(set.status).toBe(200);

    const status = await request(app)
      .get("/api/household-pin")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(status.body.isSet).toBe(true);
  });

  it("fel kod ger ok:false, rätt kod ger ok:true, ett barn kan inte ens försöka", async () => {
    const wrong = await request(app)
      .post("/api/household-pin/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ pin: "000000" });
    expect(wrong.status).toBe(200);
    expect(wrong.body.ok).toBe(false);

    const right = await request(app)
      .post("/api/household-pin/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ pin: "482913" });
    expect(right.status).toBe(200);
    expect(right.body.ok).toBe(true);

    const child = await request(app)
      .post("/api/household-pin/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ pin: "482913" });
    expect(child.status).toBe(403);
  });

  it("ett annat konto har ingen kod satt (kontoscopning)", async () => {
    const otherRegister = await request(app)
      .post("/api/auth/register")
      .send({ email: `pin-other-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Annan familj" });
    const otherToken = otherRegister.body.accessToken as string;
    const otherSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: "Den andra familjen" });
    const otherMemberId = otherSetup.body.membership.member.id as string;

    const status = await request(app)
      .get("/api/household-pin")
      .set("Authorization", `Bearer ${otherToken}`)
      .set("x-member-id", otherMemberId);
    expect(status.body.isSet).toBe(false);
  });
});
