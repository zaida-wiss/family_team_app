/**
 * Integrationstest (2026-07-25, ADR-0028): Recept. Kontobrett (som
 * TodoCategory, ADR-0019) — vilken VUXEN medlem som helst i samma konto
 * kan se/redigera/ta bort varandras recept, ett barn kan aldrig mutera
 * (requireAdultMember, återanvänd rakt av från todoCategoriesService.ts).
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

describe.skipIf(!RUN)("Recept (ADR-0028)", () => {
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
  let recipeId: string;

  const recipePayload = {
    name: "Köttfärssås",
    emoji: "🍝",
    ingredients: [{ text: "500 g köttfärs" }, { text: "1 burk krossade tomater" }],
    steps: [{ text: "Fräs köttfärsen", timedMinutes: null }, { text: "Sätt in i ugnen", timedMinutes: 25 }]
  };

  it("registrerar användare, familjekonto, en andra vuxen medlem och ett barn i samma konto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `recipes-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Recepttest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Receptfamiljen" });
    memberId = setup.body.membership.member.id as string;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const parentRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => !r.isChildRole)!.id;
    const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;

    const secondMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Andra föräldern", roleId: parentRoleId, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });
    secondMemberId = secondMember.body.id as string;

    const childMember = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Barnet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    childMemberId = childMember.body.id as string;
  });

  it("ett barn kan inte skapa ett recept", async () => {
    const res = await request(app)
      .post("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send(recipePayload);
    expect(res.status).toBe(403);
  });

  it("en vuxen skapar ett recept med ingredienser och ett tidsstyrt steg", async () => {
    const res = await request(app)
      .post("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send(recipePayload);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Köttfärssås");
    expect(res.body.ingredients).toHaveLength(2);
    expect(res.body.steps).toHaveLength(2);
    expect(res.body.steps[1].timedMinutes).toBe(25);
    recipeId = res.body.id;
  });

  it("en ANNAN vuxen medlem i samma konto ser receptet (kontobrett)", async () => {
    const res = await request(app)
      .get("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(recipeId);
  });

  it("en ANNAN vuxen medlem kan redigera receptet (kontobrett), ett barn kan inte", async () => {
    const child = await request(app)
      .patch(`/api/recipes/${recipeId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ ...recipePayload, name: "Kapat recept" });
    expect(child.status).toBe(403);

    const edit = await request(app)
      .patch(`/api/recipes/${recipeId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId)
      .send({ ...recipePayload, name: "Vegetarisk köttfärssås" });
    expect(edit.status).toBe(200);

    const list = await request(app)
      .get("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body[0].name).toBe("Vegetarisk köttfärssås");
  });

  it("tomt namn avvisas", async () => {
    const res = await request(app)
      .post("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ ...recipePayload, name: "   " });
    expect(res.status).toBe(400);
  });

  it("ett barn kan inte ta bort ett recept, en vuxen kan (mjuk radering)", async () => {
    const child = await request(app)
      .delete(`/api/recipes/${recipeId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId);
    expect(child.status).toBe(403);

    const del = await request(app)
      .delete(`/api/recipes/${recipeId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body).toEqual([]);
  });

  // 2026-07-26, Zaidas fynd: "jag kan inte ta bort recept... för created at
  // eller något datum krävs?" — receptpanelens allra första version
  // (commit ce26f7f) satte aldrig createdAt, en SENARE commit samma dag
  // (431675f) gjorde fältet required för sorteringen "Senast tillagda".
  // Recept skapade i det mellanrummet saknar fältet helt i databasen —
  // Mongoose validerar HELA dokumentet vid .save() (update OCH delete),
  // så ett sådant recept gick att LÄSA men aldrig ändra/ta bort. Fixat med
  // ett default på schemat (Recipe.ts) — Mongoose fyller i fältet vid
  // hydrering av det gamla dokumentet, ingen databasmigrering behövs.
  it("ett recept utan createdAt i databasen (kvarleva från innan fältet fanns) går att uppdatera och radera", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `recipes-legacy-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Legacytest" });
    const token = register.body.accessToken as string;
    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Legacyfamiljen" });
    const legacyMemberId = setup.body.membership.member.id as string;
    const legacyAccountId = setup.body.membership.account.id as string;

    const legacyRecipeId = `recipe-${crypto.randomUUID()}`;
    // Rå collection.insertOne (förbi Mongoose/schemadefaults) för att
    // exakt återskapa det historiska tillståndet — RecipeModel.create()
    // skulle fylla i createdAt-defaultet direkt och inte testa något.
    await mongoose.connection.db!.collection("recipes").insertOne({
      id: legacyRecipeId,
      accountId: legacyAccountId,
      name: "Gammalt recept",
      emoji: null,
      imageUrl: null,
      sourceUrl: null,
      ingredients: [{ id: "ing-legacy", text: "Något" }],
      steps: [{ id: "step-legacy", text: "Gör något", timedMinutes: null }],
      tags: [],
      createdBy: legacyMemberId,
      deletedAt: null,
      deletedBy: null
    });

    const update = await request(app)
      .patch(`/api/recipes/${legacyRecipeId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-member-id", legacyMemberId)
      .send({ ...recipePayload, name: "Uppdaterat gammalt recept" });
    expect(update.status).toBe(200);

    const del = await request(app)
      .delete(`/api/recipes/${legacyRecipeId}`)
      .set("Authorization", `Bearer ${token}`)
      .set("x-member-id", legacyMemberId);
    expect(del.status).toBe(200);
  });

  it("ett annat konto ser inga recept alls (kontoscopning)", async () => {
    const otherRegister = await request(app)
      .post("/api/auth/register")
      .send({ email: `recipes-other-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Annan familj" });
    const otherToken = otherRegister.body.accessToken as string;
    const otherSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ name: "Den andra familjen" });
    const otherMemberId = otherSetup.body.membership.member.id as string;

    const res = await request(app)
      .get("/api/recipes")
      .set("Authorization", `Bearer ${otherToken}`)
      .set("x-member-id", otherMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
