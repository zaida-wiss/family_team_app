/**
 * Integrationstest (2026-08-30, Zod-validerings-audit) — POST /api/rewards
 * spreadade tidigare hela req.body rakt in i RewardModel utan schema, så en
 * klient kunde sätta status/approvedBy/approvedAt/redeemedAt direkt vid
 * skapande och hoppa förbi hela godkännande-flödet (samma mass-assignment-
 * buggklass som ADR-0035). Verifierar att en sådan malicious payload nu
 * ignoreras (servern tvingar alltid status:"suggested" + null-fälten), och
 * att wishedBy måste peka på en riktig medlem i samma konto.
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

describe.skipIf(!RUN)("Rewards: mass-assignment-skydd vid skapande (2026-08-30)", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let otherAccountMemberId: string;

  it("registrerar två separata familjekonton", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "rewards-sec-int@bmad.test", password: "Lösenord1!", name: "Säkerhetstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Säkerhetsfamiljen" });
    expect(setup.status).toBe(201);
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const otherRegister = await request(app)
      .post("/api/auth/register")
      .send({ email: "rewards-sec-int-2@bmad.test", password: "Lösenord1!", name: "Annan familj" });
    const otherToken = otherRegister.body.accessToken as string;
    const otherSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: "En annan familj" });
    otherAccountMemberId = (otherSetup.body as { membership: { member: { id: string } } }).membership.member.id;
  });

  it("en skapande-payload som försöker sätta status/approvedBy ignoreras — belöningen skapas alltid som suggested", async () => {
    const rewardId = `reward-sec-${crypto.randomUUID()}`;
    const res = await request(app)
      .post("/api/rewards")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: rewardId,
        title: "Ny cykel",
        wishedBy: memberId,
        starsNeeded: 5,
        // Försök att hoppa förbi godkännande-flödet:
        status: "redeemed",
        approvedBy: memberId,
        approvedAt: new Date().toISOString(),
        redeemedAt: new Date().toISOString(),
      });
    expect(res.status).toBe(201);

    const list = await request(app)
      .get("/api/rewards")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const reward = (list.body as Array<{ id: string; status: string; approvedBy: string | null; redeemedAt: string | null }>)
      .find((r) => r.id === rewardId);
    expect(reward?.status).toBe("suggested");
    expect(reward?.approvedBy).toBeNull();
    expect(reward?.redeemedAt).toBeNull();
  });

  it("wishedBy som pekar på en medlem i ETT ANNAT konto avvisas med 400", async () => {
    const rewardId = `reward-sec-${crypto.randomUUID()}`;
    const res = await request(app)
      .post("/api/rewards")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: rewardId,
        title: "Ogiltig önskning",
        wishedBy: otherAccountMemberId,
        starsNeeded: 5,
      });
    expect(res.status).toBe(400);
  });

  it("en payload utan required-fält (t.ex. starsNeeded) avvisas av Zod, inte av ett Mongoose-fel längre ner", async () => {
    const res = await request(app)
      .post("/api/rewards")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ id: `reward-sec-${crypto.randomUUID()}`, title: "Saknar starsNeeded", wishedBy: memberId });
    expect(res.status).toBe(400);
  });
});
