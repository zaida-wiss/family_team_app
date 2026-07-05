/**
 * Integrationstest (2026-07-05): vuxenvyns personliga kategori-trådar.
 * Verifierar CRUD (skapa/lista/döpa om/ta bort), kontoscopning (ett annat
 * konto ska aldrig se/ändra), OCH medlems-ägarskap (en ANNAN medlem i SAMMA
 * konto ska heller inte kunna se/ändra en annan medlems personliga kategorier
 * — samma klass av brist som ADR-0009 om det saknas).
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
  let categoryId: string;

  it("registrerar användare, familjekonto och en andra medlem i samma konto", async () => {
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

    const secondMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Andra föräldern", roleId: parentRoleId, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });
    secondMemberId = (secondMember.body as { id: string }).id;
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

  it("listar bara den egna medlemmens kategorier", async () => {
    const res = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Träning");
  });

  it("en ANNAN medlem i samma konto ser INTE den första medlemmens kategori", async () => {
    const res = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("en ANNAN medlem i samma konto kan inte döpa om den första medlemmens kategori", async () => {
    const res = await request(app)
      .patch(`/api/todo-categories/${categoryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId)
      .send({ name: "Kapad" });
    expect(res.status).toBe(404);
  });

  it("en ANNAN medlem i samma konto kan inte ta bort den första medlemmens kategori", async () => {
    const res = await request(app)
      .delete(`/api/todo-categories/${categoryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId);
    expect(res.status).toBe(404);
  });

  it("ägaren kan döpa om sin egen kategori", async () => {
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

  it("ägaren kan ta bort sin egen kategori (mjuk radering — försvinner ur listan)", async () => {
    const del = await request(app)
      .delete(`/api/todo-categories/${categoryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
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
