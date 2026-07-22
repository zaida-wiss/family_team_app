/**
 * Integrationstest (2026-07-22, Zaidas önskemål: "vi använder mitt
 * adminkonto även på barnens telefoner") — barn får nu en egen inloggning
 * (User utan e-post, med username, unikt bara INOM familjen) istället för
 * att bara nås via en inloggad förälders medlemsväxling. Testar:
 * - PUT /api/members/:id/credentials: bara en vuxen med canManageMembers
 *   får sätta ett barns username+lösenord, username måste vara unikt inom
 *   familjen (inte globalt — samma username i en ANNAN familj ska funka).
 * - POST /api/auth/child-login: förälderns e-post + username + lösenord.
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

describe.skipIf(!RUN)("Barn-inloggning: PUT /api/members/:id/credentials och POST /api/auth/child-login", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let parentAccessToken: string;
  let parentEmail: string;
  let parentMemberId: string;
  let childRoleId: string;
  let childMemberId: string;
  let restrictedMemberId: string;

  it("sätter upp en familj med ett barn och en begränsad vuxen medlem", async () => {
    // ASCII-only lokal del (2026-07-22-fyndet upprepat: Zods .email()-regex
    // godkänner inte "ä" i lokala delen, se samma lärdom i e2e/helpers.ts).
    parentEmail = `barnlogin-foralder-${crypto.randomUUID()}@bmad.test`;
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: parentEmail, password: "Lösenord1!", name: "Testförälder" });
    expect(register.status).toBe(201);
    parentAccessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .send({ name: "Barnlogin-familjen" });
    parentMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .set("x-member-id", parentMemberId);
    childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;

    const child = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ name: "Nova", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    expect(child.status).toBe(201);
    childMemberId = (child.body as { id: string }).id;

    const restrictedRole = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .set("x-member-id", parentMemberId)
      .send({
        id: `role-restricted-${crypto.randomUUID()}`,
        name: "Utan medlemshantering",
        isChildRole: false,
        permissions: {
          canManageMembers: false, canManageRoles: false, canSeeAllTodos: false, canSeeOwnTodos: true,
          canCreateTodos: true, canScheduleRecurringTodos: false, canCompleteAssignedTodos: false,
          canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false, canSeeAllCalendar: false,
          canSeeOwnCalendar: false, canCreateCalendar: false, canEditCalendar: false, canImportCalendar: false,
          canExportCalendar: false, canSeeShoppingLists: false, canCreateShoppingLists: false,
          canEditShoppingLists: false, canViewTrash: false, canRestoreFromTrash: false,
          canCreateChildAccounts: false, canManageChildTodos: false
        }
      });
    const restricted = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .set("x-member-id", parentMemberId)
      .send({
        name: "Övrig vuxen", roleId: (restrictedRole.body as { id: string }).id, isChild: false,
        avatarUrl: null, color: null, dashboardTheme: null
      });
    restrictedMemberId = (restricted.body as { id: string }).id;
  });

  it("nekar att sätta barnets inloggning för en medlem utan canManageMembers", async () => {
    const res = await request(app)
      .put(`/api/members/${childMemberId}/credentials`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ username: "nova", password: "1234" });
    expect(res.status).toBe(403);
  });

  it("tillåter en förälder med canManageMembers att sätta barnets username+lösenord", async () => {
    const res = await request(app)
      .put(`/api/members/${childMemberId}/credentials`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ username: "Nova", password: "sommar2026" });
    expect(res.status).toBe(200);
    expect((res.body as { username: string }).username).toBe("nova"); // normaliserat till gemener
  });

  it("loggar in barnet via förälderns e-post + username + lösenord", async () => {
    const res = await request(app)
      .post("/api/auth/child-login")
      .send({ parentEmail, username: "NOVA", password: "sommar2026" }); // skiftläge ska inte spela roll
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Nova");
    expect(res.body.user.email).toBeNull();
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].member.id).toBe(childMemberId);
  });

  it("nekar barn-inloggning med fel lösenord, fel username eller fel förälder-e-post", async () => {
    const wrongPassword = await request(app)
      .post("/api/auth/child-login")
      .send({ parentEmail, username: "nova", password: "fel-lösenord" });
    expect(wrongPassword.status).toBe(401);

    const wrongUsername = await request(app)
      .post("/api/auth/child-login")
      .send({ parentEmail, username: "finnsinte", password: "sommar2026" });
    expect(wrongUsername.status).toBe(401);

    const wrongEmail = await request(app)
      .post("/api/auth/child-login")
      .send({ parentEmail: "finnsinte@bmad.test", username: "nova", password: "sommar2026" });
    expect(wrongEmail.status).toBe(401);
  });

  it("nekar ett andra barn i SAMMA familj att ta samma username", async () => {
    const secondChild = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ name: "Elis", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    const secondChildId = (secondChild.body as { id: string }).id;

    const res = await request(app)
      .put(`/api/members/${secondChildId}/credentials`)
      .set("Authorization", `Bearer ${parentAccessToken}`)
      .set("x-member-id", parentMemberId)
      .send({ username: "nova", password: "annatlösen" });
    expect(res.status).toBe(409);
  });

  it("tillåter SAMMA username i en ANNAN, orelaterad familj", async () => {
    const otherParentEmail = `barnlogin-annan-foralder-${crypto.randomUUID()}@bmad.test`;
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: otherParentEmail, password: "Lösenord1!", name: "Annan förälder" });
    const otherAccessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${otherAccessToken}`)
      .send({ name: "Andra familjen" });
    const otherParentMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${otherAccessToken}`)
      .set("x-member-id", otherParentMemberId);
    const otherChildRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;

    const otherChild = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${otherAccessToken}`)
      .set("x-member-id", otherParentMemberId)
      .send({ name: "Nova (annan familj)", roleId: otherChildRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    const otherChildId = (otherChild.body as { id: string }).id;

    const res = await request(app)
      .put(`/api/members/${otherChildId}/credentials`)
      .set("Authorization", `Bearer ${otherAccessToken}`)
      .set("x-member-id", otherParentMemberId)
      .send({ username: "nova", password: "annatlösen2" });
    expect(res.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/child-login")
      .send({ parentEmail: otherParentEmail, username: "nova", password: "annatlösen2" });
    expect(login.status).toBe(200);
    expect(login.body.user.name).toBe("Nova (annan familj)");
  });
});
