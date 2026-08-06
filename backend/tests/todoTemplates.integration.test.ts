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
import { TodoTemplateModel } from "../src/db/models/TodoTemplate.js";
import { TodoCategoryTemplateModel } from "../src/db/models/TodoCategoryTemplate.js";

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
    notes: "Glöm inte solkräm.",
    subtasks: [{ title: "Handduk" }, { title: "Solglasögon", timedMinutes: 15 }],
    recurrence: { type: "none" },
    starValue: 0,
    // Tidtagning (2026-08-06, Zaidas fynd: "Tidtagning text? antal minuter?
    // Går alla fält från mallen att redigera?") — saknades tidigare helt i
    // mallens Zod/Mongoose-scheman, precis som notes/timedMinutes en gång.
    timerEnabled: true,
    plannedDurationMinutes: 25
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
    // 2026-07-27, Zaidas fråga: "är mallarna uppdaterade med enheterna och
    // antal från receptet?" — notes/subtask-timedMinutes saknades tidigare
    // helt i mallens Mongoose-schema och Zod-schema.
    expect(res.body.notes).toBe("Glöm inte solkräm.");
    expect(res.body.subtasks).toHaveLength(2);
    expect(res.body.subtasks[1]).toMatchObject({ title: "Solglasögon", timedMinutes: 15 });
    expect(res.body.timerEnabled).toBe(true);
    expect(res.body.plannedDurationMinutes).toBe(25);
    taskTemplateId = res.body.id;
  });

  // 2026-07-28, Zaidas begäran "deluppgifter ska krypteras" avslöjade att
  // mallbiblioteket saknade all kryptering — title/notes/subtask-titel
  // krypteras nu här också (ADR-0014-mönstret), samma som en riktig Todo.
  it("mallens title/notes/subtask-titel ligger krypterade i det råa MongoDB-dokumentet", async () => {
    const doc = await TodoTemplateModel.findOne({ id: taskTemplateId }).lean();
    expect(doc?.title).not.toBe("Packa badkläder");
    expect(doc?.title.startsWith("v1:")).toBe(true);
    expect(doc?.notes).not.toBe("Glöm inte solkräm.");
    expect(doc?.notes?.startsWith("v1:")).toBe(true);
    expect(doc?.subtasks[1]?.title).not.toBe("Solglasögon");
    expect(doc?.subtasks[1]?.title.startsWith("v1:")).toBe(true);
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
    expect(res.body.tasks[0].notes).toBe("Glöm inte solkräm.");
    expect(res.body.tasks[0].subtasks[1]).toMatchObject({ title: "Solglasögon", timedMinutes: 15 });
    expect(res.body.tasks[0].timerEnabled).toBe(true);
    expect(res.body.tasks[0].plannedDurationMinutes).toBe(25);
    categoryTemplateId = res.body.id;
  });

  it("kategori-mallens uppgifters title/subtask-titel ligger krypterade i det råa MongoDB-dokumentet, kategorins EGET namn gör det inte", async () => {
    const doc = await TodoCategoryTemplateModel.findOne({ id: categoryTemplateId }).lean();
    expect(doc?.name).toBe("Packa");
    expect(doc?.tasks[0]?.title).not.toBe("Packa badkläder");
    expect(doc?.tasks[0]?.title.startsWith("v1:")).toBe(true);
    expect(doc?.tasks[0]?.subtasks[1]?.title).not.toBe("Solglasögon");
    expect(doc?.tasks[0]?.subtasks[1]?.title.startsWith("v1:")).toBe(true);
  });

  // 500, inte 400: samma som övriga routes i kodbasen som anropar ett Zod-
  // schemas .parse() direkt utan egen try/catch (t.ex. timedTasks.ts/
  // rewards.ts/analytics.ts) — den generella felhanteraren i app.ts läser
  // bara err.status (saknas på ett ZodError) och default:ar till 500. Ett
  // redan existerande, bredare fynd (Zod-fel borde ge 400 överallt), inte
  // något att ändra isolerat här.
  it("en kategori-mall utan uppgifter avvisas", async () => {
    const res = await request(app)
      .post("/api/todo-templates/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Tom", tasks: [] });
    expect(res.status).toBe(500);
  });

  it("listar kontots kategori-mallar", async () => {
    const res = await request(app)
      .get("/api/todo-templates/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  // 2026-07-28, Zaidas önskemål: "man ska alltid kunna uppdatera mallen i
  // kategorimenyn, om man tex ändrat ordning på dem" — PATCH uppdaterar den
  // BEFINTLIGA mallen (samma id) istället för att en ny sparning skapar en
  // duplicerad mall.
  it("uppdaterar en befintlig kategori-mall via PATCH, samma id behålls, uppgifternas ordning ändras", async () => {
    const res = await request(app)
      .patch(`/api/todo-templates/categories/${categoryTemplateId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Packa", tasks: [{ ...task, title: "Packa solkräm" }, task] });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(categoryTemplateId);
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.tasks[0].title).toBe("Packa solkräm");
    expect(res.body.tasks[1].title).toBe("Packa badkläder");

    const doc = await TodoCategoryTemplateModel.findOne({ id: categoryTemplateId }).lean();
    expect(doc?.tasks[0]?.title).not.toBe("Packa solkräm");
    expect(doc?.tasks[0]?.title.startsWith("v1:")).toBe(true);

    const list = await request(app)
      .get("/api/todo-templates/categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body).toHaveLength(1);
  });

  it("ett barn kan inte uppdatera en kategori-mall", async () => {
    const res = await request(app)
      .patch(`/api/todo-templates/categories/${categoryTemplateId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ name: "Packa", tasks: [task] });
    expect(res.status).toBe(403);
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
