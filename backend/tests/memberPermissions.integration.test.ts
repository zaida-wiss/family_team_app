/**
 * Integrationstest: server-side behörighetskontroll i membersService.ts
 * (2026-07-22, samma klass som ADR-0009/ADR-0016/timedTasks/shoppingService).
 * createMember/updateMember/deleteMember/restoreMember saknade tidigare all
 * kontroll utöver requireAuth+attachAccountId — vilken inloggad medlem som
 * helst i kontot kunde skapa nya medlemmar eller ändra/radera/återställa
 * VILKEN ANNAN MEDLEM SOM HELST.
 *
 * updateMember har en extra nyans: MemberPatchSchema blandar identitetsfält
 * (name/roleId/avatarUrl/color) med ren nav-/UI-state (lastActivePanel/
 * calendarView/...) som varje medlem måste kunna sätta för SIG SJÄLV utan
 * canManageMembers, plus dashboardTheme/childTimelineSettings som en förälder
 * med canManageChildTodos (men INTE nödvändigtvis canManageMembers) ska kunna
 * sätta åt ETT BARN. Se membersService.ts:s kommentarer för den fullständiga
 * motiveringen.
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

describe.skipIf(!RUN)("membersService: server-side behörighetskontroll", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let ownerMemberId: string; // Standard Förälder-roll: canManageMembers + canManageChildTodos
  let restrictedMemberId: string; // Egen roll: allt false
  let childCaretakerMemberId: string; // Egen roll: canManageChildTodos=true, canManageMembers=false
  let childMemberId: string;
  let parentRoleId: string;
  let childRoleId: string;

  it("sätter upp konto med ägare, en behörighetslös vuxen, en barn-omsorgsvuxen och ett barn", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "member-perm-int@bmad.test", password: "Lösenord1!", name: "Behörighetstest" });
    expect(register.status).toBe(201);
    accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Behörighetsfamiljen" });
    ownerMemberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const rolesRes = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    parentRoleId = (rolesRes.body as Array<{ id: string; isChildRole: boolean }>).find((r) => !r.isChildRole)!.id;
    childRoleId = (rolesRes.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;

    const noPermissions = {
      canManageMembers: false, canManageRoles: false, canSeeAllTodos: false, canSeeOwnTodos: true,
      canCreateTodos: true, canScheduleRecurringTodos: false, canCompleteAssignedTodos: false,
      canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false, canSeeAllCalendar: false,
      canSeeOwnCalendar: false, canCreateCalendar: false, canEditCalendar: false, canImportCalendar: false,
      canExportCalendar: false, canSeeShoppingLists: true, canCreateShoppingLists: false,
      canEditShoppingLists: false, canViewTrash: false, canRestoreFromTrash: false,
      canCreateChildAccounts: false, canManageChildTodos: false
    };

    const restrictedRole = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: `role-restricted-${crypto.randomUUID()}`,
        name: "Utan medlemsbehörigheter",
        isChildRole: false,
        permissions: noPermissions
      });
    expect(restrictedRole.status).toBe(201);

    const caretakerRole = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        id: `role-caretaker-${crypto.randomUUID()}`,
        name: "Barnomsorg utan medlemshantering",
        isChildRole: false,
        permissions: { ...noPermissions, canManageChildTodos: true }
      });
    expect(caretakerRole.status).toBe(201);

    const restricted = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        name: "Begränsad vuxen", roleId: (restrictedRole.body as { id: string }).id, isChild: false,
        avatarUrl: null, color: null, dashboardTheme: null
      });
    expect(restricted.status).toBe(201);
    restrictedMemberId = (restricted.body as { id: string }).id;

    const caretaker = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({
        name: "Barnomsorgsvuxen", roleId: (caretakerRole.body as { id: string }).id, isChild: false,
        avatarUrl: null, color: null, dashboardTheme: null
      });
    expect(caretaker.status).toBe(201);
    childCaretakerMemberId = (caretaker.body as { id: string }).id;

    const child = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({ name: "Barnet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    expect(child.status).toBe(201);
    childMemberId = (child.body as { id: string }).id;
  });

  it("nekar createMember (POST /api/members) för en medlem utan canManageMembers", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ name: "Insmugen", roleId: parentRoleId, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });
    expect(res.status).toBe(403);
  });

  it("tillåter en medlem att patcha sin EGEN nav-/UI-state utan canManageMembers", async () => {
    const res = await request(app)
      .patch(`/api/members/${restrictedMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ lastActivePanel: "calendar", calendarView: "week" });
    expect(res.status).toBe(200);
  });

  it("tillåter en medlem att patcha sitt EGET tema utan canManageMembers", async () => {
    const res = await request(app)
      .patch(`/api/members/${restrictedMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ dashboardTheme: "clear" });
    expect(res.status).toBe(200);
  });

  it("nekar en medlem att patcha sitt EGET namn/roll utan canManageMembers (roll: skyddar mot självutnämning)", async () => {
    const nameRes = await request(app)
      .patch(`/api/members/${restrictedMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ name: "Nytt namn" });
    expect(nameRes.status).toBe(403);

    const roleRes = await request(app)
      .patch(`/api/members/${restrictedMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ roleId: parentRoleId });
    expect(roleRes.status).toBe(403);
  });

  it("nekar en medlem att patcha en ANNAN medlems nav-state eller identitet", async () => {
    const navRes = await request(app)
      .patch(`/api/members/${ownerMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ lastActivePanel: "shopping" });
    expect(navRes.status).toBe(403);

    const nameRes = await request(app)
      .patch(`/api/members/${ownerMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ name: "Kapad" });
    expect(nameRes.status).toBe(403);
  });

  it("tillåter en förälder med canManageChildTodos (men UTAN canManageMembers) att sätta ett BARNS tema/tidslinje", async () => {
    const themeRes = await request(app)
      .patch(`/api/members/${childMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childCaretakerMemberId)
      .send({ dashboardTheme: "space" });
    expect(themeRes.status).toBe(200);

    const timelineRes = await request(app)
      .patch(`/api/members/${childMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childCaretakerMemberId)
      .send({ childTimelineSettings: { showCompleted: true } });
    expect(timelineRes.status).toBe(200);
  });

  it("nekar samma barnomsorgsvuxen att sätta barnets NAMN (utanför child-manageable-fälten, kräver canManageMembers)", async () => {
    const res = await request(app)
      .patch(`/api/members/${childMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", childCaretakerMemberId)
      .send({ name: "Omdöpt barn" });
    expect(res.status).toBe(403);
  });

  it("nekar en medlem UTAN canManageChildTodos att sätta barnets tema", async () => {
    const res = await request(app)
      .patch(`/api/members/${childMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId)
      .send({ dashboardTheme: "ocean" });
    expect(res.status).toBe(403);
  });

  it("tillåter ägaren (canManageMembers) att patcha en annan medlems namn", async () => {
    const res = await request(app)
      .patch(`/api/members/${restrictedMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId)
      .send({ name: "Omdöpt av ägaren" });
    expect(res.status).toBe(200);

    const list = await request(app)
      .get("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    const updated = (list.body as Array<{ id: string; name: string }>).find((m) => m.id === restrictedMemberId)!;
    expect(updated.name).toBe("Omdöpt av ägaren");
  });

  it("nekar deleteMember/restoreMember för en medlem utan rätt behörighet, tillåter för ägaren", async () => {
    const deniedDelete = await request(app)
      .delete(`/api/members/${childCaretakerMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId);
    expect(deniedDelete.status).toBe(403);

    const allowedDelete = await request(app)
      .delete(`/api/members/${childCaretakerMemberId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect(allowedDelete.status).toBe(200);

    const deniedRestore = await request(app)
      .patch(`/api/members/${childCaretakerMemberId}/restore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", restrictedMemberId);
    expect(deniedRestore.status).toBe(403);

    const allowedRestore = await request(app)
      .patch(`/api/members/${childCaretakerMemberId}/restore`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", ownerMemberId);
    expect(allowedRestore.status).toBe(200);
  });
});
