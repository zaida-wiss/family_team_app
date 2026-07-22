/**
 * Integrationstest: server-side behörighetskontroll i shoppingService.ts.
 * DELETE .../items/:itemId och POST .../clear-completed (2026-07-22) var de
 * FÖRSTA skrivningarna i filen som kontrollerade canEditShoppingLists +
 * delning (canEditSharedResource) server-side — samma mönster som redan
 * etablerats i todosService.ts (ADR-0009/ADR-0016). Samma dag, uppföljning:
 * resten av filen (createList/addItem/toggleItem/shareList/unshareList/
 * deleteList/restoreList) saknade fortfarande all kontroll — vilken inloggad
 * medlem som helst i kontot kunde skapa/ändra/dela/radera/återställa VILKEN
 * INKÖPSLISTA SOM HELST. Fixat samma dag, se resterande describe-block nedan.
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

describe.skipIf(!RUN)("shopping.ts: server-side behörighetskontroll på delete-item/clear-completed", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let ownerMemberId: string; // Standard Förälder-roll, äger listan
  let sameRoleMemberId: string; // Samma behörigheter, men varken ägare eller delad med
  let restrictedMemberId: string; // Ingen canEditShoppingLists alls
  let listId: string;
  let itemAId: string;
  let itemBId: string;

  it("sätter upp konto med ägare, en oberoende medlem och en behörighetslös medlem", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "shopping-perm-int@bmad.test", password: "Lösenord1!", name: "Behörighetstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Behörighetsfamiljen" });
    ownerMemberId = (setup.body as { membership: { member: { id: string; roleId: string } } }).membership.member.id;
    const parentRoleId = (setup.body as { membership: { member: { roleId: string } } }).membership.member.roleId;

    const sameRole = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({ name: "Andra föräldern", roleId: parentRoleId, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });
    expect(sameRole.status).toBe(201);
    sameRoleMemberId = (sameRole.body as { id: string }).id;

    const restrictedRole = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: `role-restricted-${crypto.randomUUID()}`,
        name: "Utan inköpsbehörigheter",
        isChildRole: false,
        permissions: {
          canManageMembers: false, canManageRoles: false, canSeeAllTodos: false, canSeeOwnTodos: true,
          canCreateTodos: true, canScheduleRecurringTodos: false, canCompleteAssignedTodos: false,
          canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false, canSeeAllCalendar: false,
          canSeeOwnCalendar: false, canCreateCalendar: false, canEditCalendar: false, canImportCalendar: false,
          canExportCalendar: false, canSeeShoppingLists: true, canCreateShoppingLists: false,
          canEditShoppingLists: false, canViewTrash: false, canRestoreFromTrash: false,
          canCreateChildAccounts: false, canManageChildTodos: false
        }
      });
    expect(restrictedRole.status).toBe(201);

    const restricted = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        name: "Begränsad medlem", roleId: (restrictedRole.body as { id: string }).id, isChild: false,
        avatarUrl: null, color: null, dashboardTheme: null
      });
    expect(restricted.status).toBe(201);
    restrictedMemberId = (restricted.body as { id: string }).id;
  });

  it("skapar en lista med två varor, en bockas av", async () => {
    listId = `shopping-perm-${crypto.randomUUID()}`;
    const create = await request(app)
      .post("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: listId, name: "Veckohandling", ownerId: ownerMemberId, color: "#2f7d6d", icon: null,
        sharedWith: [], deletedAt: null, deletedBy: null, items: []
      });
    expect(create.status).toBe(201);

    itemAId = `shopping-item-a-${crypto.randomUUID()}`;
    itemBId = `shopping-item-b-${crypto.randomUUID()}`;
    const addA = await request(app)
      .post(`/api/shopping/${listId}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({ id: itemAId, title: "Mjölk", createdBy: ownerMemberId, done: false, deletedAt: null, deletedBy: null });
    expect(addA.status).toBe(201);

    const addB = await request(app)
      .post(`/api/shopping/${listId}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({ id: itemBId, title: "Bröd", createdBy: ownerMemberId, done: false, deletedAt: null, deletedBy: null });
    expect(addB.status).toBe(201);

    const toggle = await request(app)
      .patch(`/api/shopping/${listId}/items/${itemBId}/toggle`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({});
    expect(toggle.status).toBe(200);
  });

  it("nekar radera-rad för en medlem utan canEditShoppingLists", async () => {
    const res = await request(app)
      .delete(`/api/shopping/${listId}/items/${itemAId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId);
    expect(res.status).toBe(403);
  });

  it("nekar radera-rad för en medlem med behörigheten men utan delning av just denna lista", async () => {
    const res = await request(app)
      .delete(`/api/shopping/${listId}/items/${itemAId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", sameRoleMemberId);
    expect(res.status).toBe(403);
  });

  it("tillåter ägaren att radera en enskild rad", async () => {
    const res = await request(app)
      .delete(`/api/shopping/${listId}/items/${itemAId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect(res.status).toBe(200);

    const lists = await request(app)
      .get("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    const list = (lists.body as Array<{ id: string; items: Array<{ id: string; deletedAt: string | null }> }>).find(
      (l) => l.id === listId
    )!;
    expect(list.items.find((i) => i.id === itemAId)?.deletedAt).not.toBeNull();
  });

  it("nekar töm-listan för en medlem utan canEditShoppingLists, tillåter för ägaren (rör bara bockade varor)", async () => {
    const denied = await request(app)
      .post(`/api/shopping/${listId}/clear-completed`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({});
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .post(`/api/shopping/${listId}/clear-completed`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({});
    expect(allowed.status).toBe(200);

    const lists = await request(app)
      .get("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    const list = (lists.body as Array<{ id: string; items: Array<{ id: string; done: boolean; deletedAt: string | null }> }>).find(
      (l) => l.id === listId
    )!;
    expect(list.items.find((i) => i.id === itemBId)?.deletedAt).not.toBeNull();
  });
});

describe.skipIf(!RUN)("shoppingService: server-side behörighetskontroll (createList/toggleItem/share/deleteList/restoreList)", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let ownerMemberId: string;
  let restrictedMemberId: string; // canCreateShoppingLists=false, canEditShoppingLists=false, canRestoreFromTrash=false
  let listId: string;
  let itemId: string;

  it("sätter upp konto med ägare + en behörighetslös medlem", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "shopping-perm2-int@bmad.test", password: "Lösenord1!", name: "Behörighetstest 2" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Behörighetsfamiljen 2" });
    ownerMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const restrictedRole = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: `role-restricted2-${crypto.randomUUID()}`,
        name: "Utan inköpsbehörigheter",
        isChildRole: false,
        permissions: {
          canManageMembers: false, canManageRoles: false, canSeeAllTodos: false, canSeeOwnTodos: true,
          canCreateTodos: true, canScheduleRecurringTodos: false, canCompleteAssignedTodos: false,
          canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false, canSeeAllCalendar: false,
          canSeeOwnCalendar: false, canCreateCalendar: false, canEditCalendar: false, canImportCalendar: false,
          canExportCalendar: false, canSeeShoppingLists: true, canCreateShoppingLists: false,
          canEditShoppingLists: false, canViewTrash: false, canRestoreFromTrash: false,
          canCreateChildAccounts: false, canManageChildTodos: false
        }
      });
    expect(restrictedRole.status).toBe(201);

    const restricted = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        name: "Begränsad medlem", roleId: (restrictedRole.body as { id: string }).id, isChild: false,
        avatarUrl: null, color: null, dashboardTheme: null
      });
    expect(restricted.status).toBe(201);
    restrictedMemberId = (restricted.body as { id: string }).id;
  });

  it("nekar createList utan canCreateShoppingLists, ignorerar spoofat ownerId annars", async () => {
    listId = `shopping-perm2-${crypto.randomUUID()}`;
    const denied = await request(app)
      .post("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({
        id: `shopping-perm2-denied-${crypto.randomUUID()}`, name: "Otillåten lista", ownerId: restrictedMemberId,
        color: "#2f7d6d", icon: null, sharedWith: [], deletedAt: null, deletedBy: null, items: []
      });
    expect(denied.status).toBe(403);

    // ownerId i body satt till restrictedMemberId trots att ownerMemberId är
    // den riktiga anroparen — servern ska ignorera det och sätta ownerId till
    // den autentiserade x-member-id, inte det klienten skickade (mass-
    // assignment-skydd, ADR-0008-mönstret).
    const allowed = await request(app)
      .post("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: listId, name: "Veckohandling 2", ownerId: restrictedMemberId,
        color: "#2f7d6d", icon: null, sharedWith: [], deletedAt: null, deletedBy: null, items: []
      });
    expect(allowed.status).toBe(201);

    const lists = await request(app)
      .get("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    const list = (lists.body as Array<{ id: string; ownerId: string }>).find((l) => l.id === listId)!;
    expect(list.ownerId).toBe(ownerMemberId);
  });

  it("nekar toggleItem/shareList/unshareList/deleteList för en behörighetslös medlem", async () => {
    itemId = `shopping-item-perm2-${crypto.randomUUID()}`;
    const addItem = await request(app)
      .post(`/api/shopping/${listId}/items`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({ id: itemId, title: "Ägg", createdBy: ownerMemberId, done: false, deletedAt: null, deletedBy: null });
    expect(addItem.status).toBe(201);

    const toggle = await request(app)
      .patch(`/api/shopping/${listId}/items/${itemId}/toggle`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({});
    expect(toggle.status).toBe(403);

    const share = await request(app)
      .post(`/api/shopping/${listId}/share`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ memberId: restrictedMemberId, access: "edit" });
    expect(share.status).toBe(403);

    const unshare = await request(app)
      .delete(`/api/shopping/${listId}/share/${ownerMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId);
    expect(unshare.status).toBe(403);

    const del = await request(app)
      .delete(`/api/shopping/${listId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId);
    expect(del.status).toBe(403);
  });

  it("tillåter toggleItem/shareList/deleteList för ägaren, delning ger mottagaren edit-åtkomst", async () => {
    const toggle = await request(app)
      .patch(`/api/shopping/${listId}/items/${itemId}/toggle`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({});
    expect(toggle.status).toBe(200);

    const share = await request(app)
      .post(`/api/shopping/${listId}/share`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({ memberId: restrictedMemberId, access: "edit" });
    expect(share.status).toBe(200);

    // restrictedMemberId har fortfarande canEditShoppingLists=false på sin
    // roll — en delning kan inte ge en behörighet rollen saknar helt.
    const toggleAfterShare = await request(app)
      .patch(`/api/shopping/${listId}/items/${itemId}/toggle`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({});
    expect(toggleAfterShare.status).toBe(403);

    const del = await request(app)
      .delete(`/api/shopping/${listId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect(del.status).toBe(200);
  });

  it("nekar restoreList utan canRestoreFromTrash, tillåter för ägaren", async () => {
    const denied = await request(app)
      .patch(`/api/shopping/${listId}/restore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId);
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .patch(`/api/shopping/${listId}/restore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect(allowed.status).toBe(200);

    const lists = await request(app)
      .get("/api/shopping")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    const list = (lists.body as Array<{ id: string; deletedAt: string | null }>).find((l) => l.id === listId)!;
    expect(list.deletedAt).toBeNull();
  });
});
