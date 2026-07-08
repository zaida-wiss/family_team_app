/**
 * Integrationstest (2026-07-08): mallbiblioteket (TodoTemplate/
 * TodoCategoryTemplate). Samma kontobrett/vuxen-bara-mönster som
 * todoCategories.integration.test.ts (ADR-0019/requireAdultMember).
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

describe.skipIf(!RUN)("Mallbiblioteket (TodoTemplate/TodoCategoryTemplate)", () => {
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
  let taskTemplateId: string;
  let categoryTemplateId: string;

  const task = {
    title: "Packa badkläder",
    visual: { type: "lucide-icon", value: "Shirt" },
    subtasks: [{ title: "Handduk" }, { title: "Solglasögon" }],
    recurrence: { type: "none" },
    starValue: 0
  };

  it("registrerar användare, familjekonto och ett barn i samma konto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "templates-int@bmad.test", password: "Lösenord1!", name: "Malltest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Mallfamiljen" });
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find(
      (r) => r.isChildRole
    )!.id;

    const childMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Barnet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    childMemberId = (childMember.body as { id: string }).id;
  });

  it("skapar en fristående uppgiftsmall", async () => {
    const res = await request(app)
      .post("/api/todo-templates/tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send(task);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Packa badkläder");
    expect(res.body.subtasks).toHaveLength(2);
    taskTemplateId = res.body.id;
  });

  it("listar kontots uppgiftsmallar", async () => {
    const res = await request(app)
      .get("/api/todo-templates/tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("ett barn kan inte skapa en uppgiftsmall", async () => {
    const res = await request(app)
      .post("/api/todo-templates/tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send(task);
    expect(res.status).toBe(403);
  });

  it("skapar en kategori-mall med flera uppgifter", async () => {
    const res = await request(app)
      .post("/api/todo-templates/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Packa", tasks: [task, { ...task, title: "Packa solkräm" }] });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Packa");
    expect(res.body.tasks).toHaveLength(2);
    categoryTemplateId = res.body.id;
  });

  it("en kategori-mall utan uppgifter avvisas", async () => {
    const res = await request(app)
      .post("/api/todo-templates/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Tom", tasks: [] });
    expect(res.status).toBe(400);
  });

  it("listar kontots kategori-mallar", async () => {
    const res = await request(app)
      .get("/api/todo-templates/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("tar bort en uppgiftsmall (mjuk radering)", async () => {
    const del = await request(app)
      .delete(`/api/todo-templates/tasks/${taskTemplateId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get("/api/todo-templates/tasks")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body).toEqual([]);
  });

  it("tar bort en kategori-mall (mjuk radering)", async () => {
    const del = await request(app)
      .delete(`/api/todo-templates/categories/${categoryTemplateId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get("/api/todo-templates/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body).toEqual([]);
  });

  it("ett annat konto ser inga mallar alls (kontoscopning)", async () => {
    const otherRegister = await request(app)
      .post("/api/auth/register")
      .send({ email: "templates-other-int@bmad.test", password: "Lösenord1!", name: "Annan familj" });
    const otherToken = otherRegister.body.accessToken as string;
    const otherSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: "Den andra familjen" });
    const otherMemberId = (otherSetup.body as { membership: { member: { id: string } } }).membership.member.id;

    const res = await request(app)
      .get("/api/todo-templates/tasks")
      .set("Authorization", `Bearer ${otherToken}`)
      .set("x-member-id", otherMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
