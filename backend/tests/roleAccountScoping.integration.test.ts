/**
 * Integrationstest: GET /api/roles ska visa ALLA ett kontos roller direkt, även
 * roller som ingen medlem använder ännu. Bekräftad live 2026-07-04 (se
 * sprint-review-2026-07-04-sprint5.md): innan detta fixades visade en helt ny
 * familjs roll-väljare bara "Förälder" — "Barn"-rollen (skapad vid setup, men
 * ingen medlem använde den förrän första barnet skapades) var osynlig, vilket
 * gjorde det omöjligt att välja "Barn" för sitt allra första barn. Grundorsaken
 * var att RoleModel saknade ett accountId-fält — "vilket konto äger rollen"
 * härleddes indirekt via medlemsanvändning (se ADR-0009).
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";

const NO_PERMISSIONS = {
  canManageMembers: false, canManageRoles: false, canSeeAllTodos: false, canSeeOwnTodos: false,
  canCreateTodos: false, canScheduleRecurringTodos: false, canCompleteAssignedTodos: false,
  canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false, canSeeAllCalendar: false,
  canSeeOwnCalendar: false, canCreateCalendar: false, canEditCalendar: false, canImportCalendar: false,
  canExportCalendar: false, canSeeShoppingLists: false, canCreateShoppingLists: false,
  canEditShoppingLists: false, canViewTrash: false, canRestoreFromTrash: false,
  canCreateChildAccounts: false, canManageChildTodos: false
};

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("Roller är kontoscopade via Role.accountId", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it("ett helt nytt konto ser BÅDE Förälder- och Barn-rollen direkt, innan något barn finns", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "role-scope-int@bmad.test", password: "Lösenord1!", name: "Rolltest" });
    expect(register.status).toBe(201);
    const accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Rollfamiljen" });
    expect(setup.status).toBe(201);
    const memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);

    expect(roles.status).toBe(200);
    const roleNames = (roles.body as Array<{ name: string; isChildRole: boolean }>).map((r) => r.name).sort();
    expect(roleNames).toEqual(["Barn", "Förälder"]);
  });

  it("en nyskapad, ännu oanvänd roll syns direkt för det egna kontot, men aldrig för ett annat konto", async () => {
    const registerA = await request(app)
      .post("/api/auth/register")
      .send({ email: "role-scope-a-int@bmad.test", password: "Lösenord1!", name: "Konto A" });
    const tokenA = registerA.body.accessToken as string;
    const setupA = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Familj A" });
    const memberA = (setupA.body as { membership: { member: { id: string } } }).membership.member.id;

    const registerB = await request(app)
      .post("/api/auth/register")
      .send({ email: "role-scope-b-int@bmad.test", password: "Lösenord1!", name: "Konto B" });
    const tokenB = registerB.body.accessToken as string;
    const setupB = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Familj B" });
    const memberB = (setupB.body as { membership: { member: { id: string } } }).membership.member.id;

    const createRole = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-member-id", memberA)
      .send({ id: `role-custom-${crypto.randomUUID()}`, name: "Mormor", isChildRole: false, permissions: NO_PERMISSIONS });
    expect(createRole.status).toBe(201);

    const rolesA = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${tokenA}`)
      .set("x-member-id", memberA);
    expect((rolesA.body as Array<{ name: string }>).some((r) => r.name === "Mormor")).toBe(true);

    const rolesB = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${tokenB}`)
      .set("x-member-id", memberB);
    expect((rolesB.body as Array<{ name: string }>).some((r) => r.name === "Mormor")).toBe(false);
  });
});
