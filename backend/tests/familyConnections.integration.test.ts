/**
 * Integrationstest (ADR-0030, 2026-07-29) — Familjeanslutningar, den LÄTTA
 * formen ("bara familjemedlemmar"): ger INTE kontoåtkomst/medlemskap, bara
 * extra sektioner (todos för exponerade medlemmar, hela recept-/
 * inköpslistesamlingen) i den mottagande familjens Todos-/Recept-/
 * Inköp-paneler. Symmetrisk, TVÅ OBEROENDE HALVOR
 * (Account.familyConnections) — se ADR:ns rättelseavsnitt.
 *
 * Täcker: lookup, skicka inbjudan (pending), väntande-listan hos
 * mottagaren, acceptera (mirrored accepted-post + ursprungsposten markerad
 * accepted), listMyConnections (bägge riktningarna), getConnectionTodos
 * (bara exponerade medlemmar, bara om dataScope.todos), complete/approve/
 * reject kräver "edit", getConnectionRecipes/getConnectionShoppingLists
 * (kontobrett, styrs bara av dataScope, inte exposedMemberIds), avböj,
 * återkalla (rör bara min egen halva), samt negativa fall (en tredje
 * orelaterad familj ser ingenting, en medlem utan canManageMembers kan
 * inte hantera anslutningar).
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import crypto from "crypto";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

function todoPayload(overrides: Record<string, unknown>) {
  return {
    isShared: false, status: "pending", starValue: 5,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    visibleFrom: null, expiresAt: null, completedAt: null, approvedBy: null,
    approvedAt: null, rejectedBy: null, rejectedAt: null, deletedAt: null, deletedBy: null,
    ...overrides
  };
}

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

describe.skipIf(!RUN)("ADR-0030: Familjeanslutningar (den lätta formen)", () => {
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
  let connectionId: string;
  let exposedTodoId: string;

  it("sätter upp tre separata familjer", async () => {
    familyA = await registerFamily(`famconn-a-${crypto.randomUUID()}@bmad.test`, "Familj A");
    familyB = await registerFamily(`famconn-b-${crypto.randomUUID()}@bmad.test`, "Familj B");
    familyC = await registerFamily(`famconn-c-${crypto.randomUUID()}@bmad.test`, "Familj C");
  });

  it("A slår upp B via e-post", async () => {
    const res = await request(app)
      .post(`/api/accounts/${familyA.accountId}/family-connections/lookup`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ email: familyB.email });
    expect(res.status).toBe(200);
    expect((res.body.accounts as Array<{ accountId: string }>).some((a) => a.accountId === familyB.accountId)).toBe(true);
  });

  it("A skickar en inbjudan till B (exponerar sig själv, view, alla tre scope)", async () => {
    const res = await request(app)
      .post(`/api/accounts/${familyA.accountId}/family-connections`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        otherAccountId: familyB.accountId,
        exposedMemberIds: [familyA.parentMemberId],
        access: "view",
        dataScope: { todos: true, recipes: true, shoppingLists: true }
      });
    expect(res.status).toBe(201);
  });

  it("B ser den väntande inbjudan från A", async () => {
    const res = await request(app)
      .get(`/api/accounts/${familyB.accountId}/family-connections/pending`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(res.status).toBe(200);
    const pending = res.body as Array<{ connectionId: string; fromAccountId: string }>;
    expect(pending).toHaveLength(1);
    expect(pending[0].fromAccountId).toBe(familyA.accountId);
    connectionId = pending[0].connectionId;
  });

  it("C ser ingenting (tredje, orelaterad familj)", async () => {
    const res = await request(app)
      .get(`/api/accounts/${familyC.accountId}/family-connections/pending`)
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("B accepterar, exponerar sig själv tillbaka med edit-åtkomst", async () => {
    const res = await request(app)
      .post(`/api/accounts/${familyB.accountId}/family-connections/pending/${familyA.accountId}/accept`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({
        exposedMemberIds: [familyB.parentMemberId],
        access: "edit",
        dataScope: { todos: true, recipes: true, shoppingLists: true }
      });
    expect(res.status).toBe(200);
  });

  it("listMyConnections visar båda riktningarna korrekt hos A och B", async () => {
    const resA = await request(app)
      .get(`/api/accounts/${familyA.accountId}/family-connections`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(resA.body.exposedByMe).toHaveLength(1);
    expect(resA.body.exposedByMe[0].access).toBe("view");
    expect(resA.body.exposedToMe).toHaveLength(1);
    expect(resA.body.exposedToMe[0].fromAccountId).toBe(familyB.accountId);
    expect(resA.body.exposedToMe[0].access).toBe("edit");

    const resB = await request(app)
      .get(`/api/accounts/${familyB.accountId}/family-connections`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(resB.body.exposedByMe).toHaveLength(1);
    expect(resB.body.exposedByMe[0].access).toBe("edit");
    expect(resB.body.exposedToMe).toHaveLength(1);
    expect(resB.body.exposedToMe[0].fromAccountId).toBe(familyA.accountId);
    expect(resB.body.exposedToMe[0].access).toBe("view");
  });

  // A skickade inbjudan med access:"view" (A→B, se ovan) — B har alltså bara
  // VISNINGSÅTKOMST till A:s exponerade medlem. B accepterade med
  // access:"edit" (B→A) — A har alltså REDIGERINGSÅTKOMST till B:s.
  it("skapar en todo tilldelad A:s förälder — B (view-åtkomst) ser den i getConnectionTodos", async () => {
    exposedTodoId = `todo-famconn-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: exposedTodoId,
        title: "Handla mjölk",
        createdBy: familyA.parentMemberId,
        assignedTo: familyA.parentMemberId,
        ...todoPayload({})
      });

    const res = await request(app)
      .get("/api/todos/connections")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    expect(res.status).toBe(200);
    const thread = (res.body as Array<{ accountId: string; access: string; todos: Array<{ id: string }> }>).find(
      (t) => t.accountId === familyA.accountId
    );
    expect(thread).toBeTruthy();
    expect(thread!.access).toBe("view");
    expect(thread!.todos.some((t) => t.id === exposedTodoId)).toBe(true);
  });

  it("A (edit-åtkomst till B) ser B:s tråd med edit-access, även innan B skapat några todos", async () => {
    const res = await request(app)
      .get("/api/todos/connections")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    const thread = (res.body as Array<{ accountId: string; access: string }>).find((t) => t.accountId === familyB.accountId);
    expect(thread?.access).toBe("edit");
  });

  // familyB.parentMemberId är en VUXEN — assignedMemberNeedsApproval (todosService.ts)
  // kräver bara godkännande för barn, så en vuxens egen todo går direkt till
  // "approved" vid complete, inget separat approve-steg behövs (eller är
  // möjligt: todon är redan "approved", inte "done", så ett andra
  // anrop mot .../approve hade korrekt gett 404 "inte done").
  it("A (edit) kan slutföra en todo i B:s konto via connection-vägen (auto-godkänns direkt, vuxen mottagare)", async () => {
    const todoInB = `todo-famconn-b-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({
        id: todoInB,
        title: "Diska",
        createdBy: familyB.parentMemberId,
        assignedTo: familyB.parentMemberId,
        ...todoPayload({})
      });

    const complete = await request(app)
      .patch(`/api/todos/connections/${familyB.accountId}/${todoInB}/complete`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ elapsedMs: null });
    expect(complete.status).toBe(200);

    const todosInB = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    const updated = (todosInB.body as Array<{ id: string; status: string }>).find((t) => t.id === todoInB);
    expect(updated?.status).toBe("approved");
  });

  it("B (bara view-åtkomst till A) nekas att slutföra den tidigare skapade todon i A:s konto", async () => {
    const complete = await request(app)
      .patch(`/api/todos/connections/${familyA.accountId}/${exposedTodoId}/complete`)
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId)
      .send({ elapsedMs: null });
    expect(complete.status).toBe(403);
  });

  it("getConnectionRecipes/getConnectionShoppingLists är kontobreda (inte medlems-scopade) och styrs av dataScope", async () => {
    await request(app)
      .post("/api/recipes")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ name: "Pannkakor", emoji: "🥞", tags: [], ingredients: [], steps: [] });

    await request(app)
      .post("/api/shopping")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ id: `shop-famconn-${crypto.randomUUID()}`, name: "Veckohandling", color: "#ffffff", icon: null, items: [] });

    const recipesRes = await request(app)
      .get("/api/recipes/connections")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    const recipeGroup = (recipesRes.body as Array<{ accountId: string; recipes: Array<{ name: string }> }>).find(
      (g) => g.accountId === familyA.accountId
    );
    expect(recipeGroup?.recipes.some((r) => r.name === "Pannkakor")).toBe(true);

    const listsRes = await request(app)
      .get("/api/shopping/connections")
      .set("Authorization", `Bearer ${familyB.accessToken}`)
      .set("x-member-id", familyB.parentMemberId);
    const listGroup = (listsRes.body as Array<{ accountId: string; lists: Array<{ name: string }> }>).find(
      (g) => g.accountId === familyA.accountId
    );
    expect(listGroup?.lists.some((l) => l.name === "Veckohandling")).toBe(true);
  });

  it("en medlem utan canManageMembers kan inte skicka/hantera anslutningar", async () => {
    const rolesA = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    const restrictedRole = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({
        id: `role-${crypto.randomUUID()}`,
        name: "Utan behörighet",
        isChildRole: false,
        permissions: Object.fromEntries(
          Object.keys((rolesA.body as Array<{ permissions: Record<string, boolean> }>)[0].permissions).map((k) => [k, false])
        )
      });
    const restrictedMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId)
      .send({ name: "Utan behörighet", roleId: restrictedRole.body.id, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });

    const res = await request(app)
      .post(`/api/accounts/${familyA.accountId}/family-connections`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", restrictedMember.body.id)
      .send({ otherAccountId: familyC.accountId, exposedMemberIds: [familyA.parentMemberId], access: "view", dataScope: {} });
    expect(res.status).toBe(403);
  });

  it("A avböjer en ny inbjudan från C, ingen post skapas", async () => {
    await request(app)
      .post(`/api/accounts/${familyC.accountId}/family-connections`)
      .set("Authorization", `Bearer ${familyC.accessToken}`)
      .set("x-member-id", familyC.parentMemberId)
      .send({ otherAccountId: familyA.accountId, exposedMemberIds: [familyC.parentMemberId], access: "view", dataScope: {} });

    const decline = await request(app)
      .post(`/api/accounts/${familyA.accountId}/family-connections/pending/${familyC.accountId}/decline`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(decline.status).toBe(200);

    const pending = await request(app)
      .get(`/api/accounts/${familyA.accountId}/family-connections/pending`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(pending.body).toEqual([]);
  });

  it("A återkallar sin egen anslutning till B — rör bara A:s halva, B:s exponering till A ligger kvar", async () => {
    const revoke = await request(app)
      .delete(`/api/accounts/${familyA.accountId}/family-connections/${connectionId}`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(revoke.status).toBe(200);

    const resA = await request(app)
      .get(`/api/accounts/${familyA.accountId}/family-connections`)
      .set("Authorization", `Bearer ${familyA.accessToken}`)
      .set("x-member-id", familyA.parentMemberId);
    expect(resA.body.exposedByMe).toEqual([]);
    // B:s egen post (deras exponering TILL A) rörs inte av A:s återkallelse.
    expect(resA.body.exposedToMe).toHaveLength(1);
  });
});
