/**
 * Integrationstest (2026-08-01, Zaidas önskemål: "samma gäller inköpslistan"
 * — sedan rättad: "man ska inte kunna göra inköpslistor i familjer man inte
 * är medlem i") — Mina familjekonton (genuint medlemskap i flera konton),
 * samma mönster som crossAccountFamilyTodos.integration.test.ts men för
 * inköpslistor. MEDVETET INGEN motsvarande Familjeanslutnings-variant för
 * SKAPANDE (bara läsning stöds där, se familyConnectionsService.ts).
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

describe.skipIf(!RUN)("Mina familjekonton — inköpslistor över flera EGNA medlemskap", () => {
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
  let newListId: string;

  it("en och samma användare skapar två separata familjekonton, plus en utomstående", async () => {
    const email = `dubbelkonto-shop-${crypto.randomUUID()}@bmad.test`;
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

    const outsider = await request(app)
      .post("/api/auth/register")
      .send({ email: `utomstaende-shop-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Utomstående" });
    outsiderToken = outsider.body.accessToken as string;
    const outsiderSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ name: "Familj C" });
    outsiderMemberId = outsiderSetup.body.membership.member.id as string;
  });

  it("skapar en ny inköpslista direkt i konto B från konto A, syns i konto A:s cross-account-vy", async () => {
    const create = await request(app)
      .post(`/api/shopping/cross-account/${accountB.accountId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId)
      .send({
        id: `shopping-${crypto.randomUUID()}`, name: "Veckohandling", color: "#2f7d6d", icon: null,
        ownerId: "", sharedWith: [], deletedAt: null, deletedBy: null, items: []
      });
    expect(create.status).toBe(201);
    newListId = create.body.id as string;

    const listed = await request(app)
      .get("/api/shopping/cross-account")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountA.memberId);
    expect(listed.status).toBe(200);
    const bGroup = (listed.body as Array<{ accountId: string; accountName: string; lists: Array<{ id: string; ownerId: string }> }>).find(
      (g) => g.accountId === accountB.accountId
    )!;
    expect(bGroup.accountName).toBe("Familj B");
    const created = bGroup.lists.find((l) => l.id === newListId)!;
    // ownerId sätts server-side till min RIKTIGA medlemspost i konto B, inte
    // den tomma platshållaren klienten skickade (mass-assignment-skydd).
    // Min medlemspost i konto B är ett HELT EGET Member-dokument/id, skilt
    // från accountA.memberId (samma användare, men varje konto har sin egen
    // medlemspost) — verifierar därför att servern satte ETT RIKTIGT id
    // (inte den tomma platshållaren, och inte av misstag konto A:s id).
    expect(created.ownerId).toBeTruthy();
    expect(created.ownerId).not.toBe("");
    expect(created.ownerId).not.toBe(accountA.memberId);
  });

  it("listan syns direkt i konto B:s egen vanliga lista (samma data, inte en kopia)", async () => {
    const res = await request(app)
      .get("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", accountB.memberId);
    expect((res.body as Array<{ id: string }>).some((l) => l.id === newListId)).toBe(true);
  });

  it("en helt orelaterad utomstående kan INTE skapa en lista i konto B", async () => {
    const res = await request(app)
      .post(`/api/shopping/cross-account/${accountB.accountId}`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .set("x-member-id", outsiderMemberId)
      .send({
        id: `shopping-${crypto.randomUUID()}`, name: "Otillåten lista", color: "#2f7d6d", icon: null,
        ownerId: "", sharedWith: [], deletedAt: null, deletedBy: null, items: []
      });
    expect(res.status).toBe(403);
  });

  it("en helt orelaterad utomstående ser ingenting i sin egen cross-account-vy", async () => {
    const res = await request(app)
      .get("/api/shopping/cross-account")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .set("x-member-id", outsiderMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
