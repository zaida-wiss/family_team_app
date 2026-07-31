/**
 * Integrationstest (2026-07-31): Vecko-måltidsplanering. Kontobrett (som
 * Recept, ADR-0028) — vilken VUXEN medlem som helst i samma konto kan
 * skapa/ta bort en rad, ett barn kan aldrig mutera (requireAdultMember).
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

describe.skipIf(!RUN)("Vecko-måltidsplanering", () => {
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
  let entryId: string;

  it("registrerar familj, en andra vuxen, ett barn och ett recept", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `mealplan-int-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Måltidstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Måltidsfamiljen" });
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

    const recipe = await request(app)
      .post("/api/recipes")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Pannkakor", ingredients: [], steps: [] });
    expect(recipe.status).toBe(201);
    recipeId = recipe.body.id;
  });

  it("ett barn kan inte skapa en måltidsplanrad", async () => {
    const res = await request(app)
      .post("/api/meal-plan")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId)
      .send({ date: "2026-08-03", mealSlot: "dinner", recipeId });
    expect(res.status).toBe(403);
  });

  it("ogiltig måltid/datum avvisas", async () => {
    const badSlot = await request(app)
      .post("/api/meal-plan")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ date: "2026-08-03", mealSlot: "brunch", recipeId });
    expect(badSlot.status).toBe(400);

    const badDate = await request(app)
      .post("/api/meal-plan")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ date: "inte-ett-datum", mealSlot: "dinner", recipeId });
    expect(badDate.status).toBe(400);
  });

  it("en vuxen skapar en måltidsplanrad", async () => {
    const res = await request(app)
      .post("/api/meal-plan")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ date: "2026-08-03", mealSlot: "dinner", recipeId });
    expect(res.status).toBe(201);
    expect(res.body.date).toBe("2026-08-03");
    expect(res.body.mealSlot).toBe("dinner");
    expect(res.body.recipeId).toBe(recipeId);
    entryId = res.body.id;
  });

  it("en ANNAN vuxen medlem i samma konto ser raden (kontobrett), filtrerad på from/until", async () => {
    const res = await request(app)
      .get("/api/meal-plan?from=2026-08-01&until=2026-08-07")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(entryId);

    const outsideRange = await request(app)
      .get("/api/meal-plan?from=2026-09-01&until=2026-09-07")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId);
    expect(outsideRange.body).toEqual([]);
  });

  it("ett barn kan inte ta bort raden, en vuxen kan", async () => {
    const child = await request(app)
      .delete(`/api/meal-plan/${entryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childMemberId);
    expect(child.status).toBe(403);

    const adult = await request(app)
      .delete(`/api/meal-plan/${entryId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", secondMemberId);
    expect(adult.status).toBe(200);

    const list = await request(app)
      .get("/api/meal-plan?from=2026-08-01&until=2026-08-07")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(list.body).toEqual([]);
  });

  it("en helt orelaterad utomstående ser ingenting", async () => {
    const outsider = await request(app)
      .post("/api/auth/register")
      .send({ email: `mealplan-outsider-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Utomstående" });
    const outsiderToken = outsider.body.accessToken as string;
    const outsiderSetup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ name: "Familj C" });
    const outsiderMemberId = outsiderSetup.body.membership.member.id as string;

    const res = await request(app)
      .get("/api/meal-plan?from=2026-08-01&until=2026-08-07")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .set("x-member-id", outsiderMemberId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
