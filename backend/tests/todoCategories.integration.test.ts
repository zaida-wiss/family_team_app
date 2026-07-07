/**
 * Integrationstest (2026-07-05, ombyggt 2026-07-07 för ADR-0019): vuxenvyns
 * personliga kategori-trådar. Verifierar CRUD (skapa/lista/döpa om/ta bort),
 * kontoscopning (ett annat konto ska aldrig se/ändra) OCH — sedan ADR-0019 —
 * att kategorier är KONTOBREDA: vilken VUXEN medlem som helst i samma konto
 * kan se/döpa om/ta bort varandras kategorier (var tidigare strikt privat per
 * medlem, se ADR-0019 för motivering). Barn ska fortfarande aldrig kunna
 * skapa/ändra/ta bort en kategori (requireAdultMember).
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

describe.skipIf(!RUN)("Vuxenvyns personliga kategorier", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let secondMemberId: string;
  let childMemberId: string;
  let categoryId: string;

  it("registrerar användare, familjekonto, en andra vuxen medlem och ett barn i samma konto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "categories-int@bmad.test", password: "Lösenord1!", name: "Kategoritest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Kategorifamiljen" });
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const parentRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find(
      (r) => !r.isChildRole
    )!.id;
    const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find(
      (r) => r.isChildRole
    )!.id;

    const secondMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Andra föräldern", roleId: parentRoleId, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });
    secondMemberId = (secondMember.body as { id: string }).id;

    const childMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Barnet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    childMemberId = (childMember.body as { id: string }).id;
  });

  it("skapar en personlig kategori", async () => {
    const res = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Träning" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Träning");
    categoryId = res.body.id;
  });

  it("listar kontots kategorier (kontobrett sedan ADR-0019)", async () => {
    const res = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Träning");
  });

  it("en ANNAN vuxen medlem i samma konto SER den första medlemmens kategori (kontobrett)", async () => {
    const res = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Träning");
  });

  it("ett barn kan inte skapa en kategori", async () => {
    const res = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ name: "Barnets kategori" });
    expect(res.status).toBe(403);
  });

  it("en ANNAN vuxen medlem i samma konto kan döpa om en kategori som inte är hens egen", async () => {
    const res = await request(app)
      .patch(`/api/todo-categories/${categoryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId)
      .send({ name: "Kondition" });
    expect(res.status).toBe(200);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body[0].name).toBe("Kondition");
  });

  it("ett barn kan inte döpa om en kategori", async () => {
    const res = await request(app)
      .patch(`/api/todo-categories/${categoryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ name: "Kapad" });
    expect(res.status).toBe(403);
  });

  it("den ursprungliga ägaren kan fortfarande döpa om kategorin", async () => {
    const res = await request(app)
      .patch(`/api/todo-categories/${categoryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Löpning" });
    expect(res.status).toBe(200);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body[0].name).toBe("Löpning");
  });

  it("tomt namn avvisas", async () => {
    const res = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "   " });
    expect(res.status).toBe(400);
  });

  it("ett barn kan inte ta bort en kategori", async () => {
    const res = await request(app)
      .delete(`/api/todo-categories/${categoryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId);
    expect(res.status).toBe(403);
  });

  it("en ANNAN vuxen medlem i samma konto kan ta bort en kategori som inte är hens egen (mjuk radering)", async () => {
    const del = await request(app)
      .delete(`/api/todo-categories/${categoryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body).toEqual([]);
  });

  it("ett annat konto ser inga kategorier alls (kontoscopning)", async () => {
    const otherRegister = await request(app)
      .post("/api/auth/register")
      .send({ email: "categories-other-int@bmad.test", password: "Lösenord1!", name: "Annan familj" });
    const otherToken = otherRegister.body.accessToken as string;
    const otherSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: "Den andra familjen" });
    const otherMemberId = (otherSetup.body as { membership: { member: { id: string } } }).membership.member.id;

    const res = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${otherToken}`)
      .set("x-member-id", otherMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
