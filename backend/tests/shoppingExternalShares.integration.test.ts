/**
 * Integrationstest (ADR-0026, 2026-07-23) — dela en inköpslista med en
 * annan familj, icke-transitivt, inom eller mellan familjekonton. Samma
 * struktur/täckning som childShares.integration.test.ts (ADR-0024).
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
  const accountId = (setup.body as { membership: { account: { id: string } } }).membership.account.id;

  return { accessToken, parentMemberId, accountId, email };
}

describe.skipIf(!RUN)("ADR-0026: dela en inköpslista med en annan familj", () => {
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
  let listId: string;
  let itemId: string;

  it("sätter upp tre separata familjer och en inköpslista med en vara i familj A", async () => {
    familyA = await registerFamily(`familjA-${crypto.randomUUID()}@bmad.test`, "Familj A");
    familyB = await registerFamily(`familjB-${crypto.randomUUID()}@bmad.test`, "Familj B");
    familyC = await registerFamily(`familjC-${crypto.randomUUID()}@bmad.test`, "Familj C");

    listId = `shopping-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/shopping")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: listId, name: "Veckohandling", color: "#2f7d6d", icon: null,
        ownerId: familyA.parentMemberId, sharedWith: [], deletedAt: null, deletedBy: null, items: []
      });

    itemId = `shopping-item-${crypto.randomUUID()}`;
    await request(app)
      .post(`/api/shopping/${listId}/items`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ id: itemId, title: "Mjölk", createdBy: familyA.parentMemberId, done: false, deletedAt: null, deletedBy: null });
  });

  it("familj B ser INGENTING delat innan en delning skapats", async () => {
    const res = await request(app)
      .get("/api/shopping/shared-lists")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("familj B (obehörig, ingen delning än) kan INTE skapa en delning av familj A:s lista", async () => {
    const res = await request(app)
      .post(`/api/shopping/${listId}/external-share`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ granteeMemberId: familyC.parentMemberId, granteeAccountId: familyC.accountId, access: "view" });
    expect(res.status).toBe(404); // listan hittas inte i familj B:s (fel) konto
  });

  it("familj A:s ägare slår upp familj B:s förälder via e-post och delar listan med 'view'", async () => {
    const lookup = await request(app)
      .post(`/api/shopping/${listId}/external-share/lookup`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ email: familyB.email });
    expect(lookup.status).toBe(200);
    expect(lookup.body.memberships).toHaveLength(1);
    expect(lookup.body.memberships[0].memberId).toBe(familyB.parentMemberId);

    const share = await request(app)
      .post(`/api/shopping/${listId}/external-share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: familyB.parentMemberId, granteeAccountId: familyB.accountId, access: "view" });
    expect(share.status).toBe(201);
  });

  it("familj B ser nu listan, men kan INTE lägga till en vara med bara 'view'-åtkomst", async () => {
    const list = await request(app)
      .get("/api/shopping/shared-lists")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].access).toBe("view");
    expect(list.body[0].list.items.map((i: { id: string }) => i.id)).toContain(itemId);

    const add = await request(app)
      .post(`/api/shopping/shared/${familyA.accountId}/${listId}/items`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ id: `shopping-item-${crypto.randomUUID()}`, title: "Bröd", createdBy: familyB.parentMemberId, done: false, deletedAt: null, deletedBy: null });
    expect(add.status).toBe(403);

    const toggle = await request(app)
      .patch(`/api/shopping/shared/${familyA.accountId}/${listId}/items/${itemId}/toggle`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(toggle.status).toBe(403);
  });

  it("familj C (helt orelaterad, ingen delning) ser fortsatt ingenting och kan inte skriva", async () => {
    const list = await request(app)
      .get("/api/shopping/shared-lists")
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId);
    expect(list.body).toEqual([]);

    const toggle = await request(app)
      .patch(`/api/shopping/shared/${familyA.accountId}/${listId}/items/${itemId}/toggle`)
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId);
    expect(toggle.status).toBe(403);
  });

  it("familj B kan INTE dela listan vidare till familj C — strukturellt omöjligt, inte en flagga", async () => {
    const res = await request(app)
      .post(`/api/shopping/${listId}/external-share`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ granteeMemberId: familyC.parentMemberId, granteeAccountId: familyC.accountId, access: "view" });
    expect(res.status).toBe(404);
  });

  it("uppgraderar delningen till 'edit' — familj B kan nu lägga till/bocka av/radera varor", async () => {
    const upgrade = await request(app)
      .post(`/api/shopping/${listId}/external-share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: familyB.parentMemberId, granteeAccountId: familyB.accountId, access: "edit" });
    expect(upgrade.status).toBe(201);

    const newItemId = `shopping-item-${crypto.randomUUID()}`;
    const add = await request(app)
      .post(`/api/shopping/shared/${familyA.accountId}/${listId}/items`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ id: newItemId, title: "Bröd", createdBy: familyB.parentMemberId, done: false, deletedAt: null, deletedBy: null });
    expect(add.status).toBe(201);

    const toggle = await request(app)
      .patch(`/api/shopping/shared/${familyA.accountId}/${listId}/items/${itemId}/toggle`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(toggle.status).toBe(200);

    const remove = await request(app)
      .delete(`/api/shopping/shared/${familyA.accountId}/${listId}/items/${newItemId}`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(remove.status).toBe(200);

    const all = await request(app)
      .get("/api/shopping")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    const saved = (all.body as Array<{ id: string; items: Array<{ id: string; done: boolean; deletedAt: string | null }> }>).find((l) => l.id === listId)!;
    expect(saved.items.find((i) => i.id === itemId)!.done).toBe(true);
    expect(saved.items.find((i) => i.id === newItemId)!.deletedAt).not.toBeNull();
  });

  it("återkallar delningen — familj B förlorar åtkomsten helt", async () => {
    const revoke = await request(app)
      .delete(`/api/shopping/${listId}/external-share/${familyB.accountId}/${familyB.parentMemberId}`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(revoke.status).toBe(200);

    const list = await request(app)
      .get("/api/shopping/shared-lists")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(list.body).toEqual([]);
  });

  it("delning fungerar likadant INOM samma familjekonto (samma accountId på båda sidor)", async () => {
    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    const parentRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => !r.isChildRole)!.id;

    const otherAdult = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ name: "Andra föräldern", roleId: parentRoleId, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });
    const otherAdultId = (otherAdult.body as { id: string }).id;

    const share = await request(app)
      .post(`/api/shopping/${listId}/external-share`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ granteeMemberId: otherAdultId, granteeAccountId: familyA.accountId, access: "view" });
    expect(share.status).toBe(201);

    const list = await request(app)
      .get("/api/shopping/shared-lists")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", otherAdultId);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].list.id).toBe(listId);
  });
});
