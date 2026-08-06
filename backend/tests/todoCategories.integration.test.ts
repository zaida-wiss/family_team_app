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

  it("skapar en personlig kategori (isFamily default false)", async () => {
    const res = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Träning" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Träning");
    expect(res.body.isFamily).toBe(false);
    categoryId = res.body.id;
  });

  // 2026-08-03, Zaidas önskemål: riktiga familjekategorier i Hem-vyn, delar
  // samma CRUD/hook som den personliga Todos-panelen (isFamily:true).
  it("skapar en familjekategori (isFamily:true)", async () => {
    const res = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Hushåll", isFamily: true });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Hushåll");
    expect(res.body.isFamily).toBe(true);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const family = (list.body as Array<{ name: string; isFamily?: boolean }>).find((c) => c.name === "Hushåll");
    expect(family?.isFamily).toBe(true);

    // Städas bort igen så resten av testfilens antaganden (t.ex. "listar
    // kontots kategorier" nedan förväntar bara EN kvarvarande kategori) inte
    // påverkas av den här familjekategorin.
    await request(app)
      .delete(`/api/todo-categories/${res.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
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

// 2026-08-06, Zaidas önskemål (efter frågan "vad händer med uppgifter som
// saknar kategori?"): deleteCategory rörde tidigare bara kategorin själv —
// uppgifter som pekade på den (personalCategoryId) blev tysta, trasiga
// referenser. Nu nollställs de (personliga kategorier, samlas upp virtuellt
// i "Mina uppgifter" i frontend) eller flyttas till en riktig, auto-skapad
// samlingskategori (familjekategorier — namngiven efter kontot, återanvänd
// om den redan finns, ALDRIG skapad om det inte fanns några uppgifter kvar).
function todoPayload(overrides: Record<string, unknown>) {
  return {
    isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    visibleFrom: null, expiresAt: null, completedAt: null, approvedBy: null,
    approvedAt: null, rejectedBy: null, rejectedAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null, inProgressBy: [], inProgressSince: null,
    ...overrides
  };
}

describe.skipIf(!RUN)("deleteCategory: uppgifter blir okategoriserade, familjekategorier får en auto-skapad samlingskategori", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  let accessToken: string;
  let memberId: string;
  let accountName: string;

  it("sätter upp konto", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "categories-orphan-int@bmad.test", password: "Lösenord1!", name: "Kategoriorfantest" });
    accessToken = register.body.accessToken as string;

    accountName = "Orfanfamiljen";
    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: accountName });
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;
  });

  it("radera en TOM kategori: inga uppgifter, ingen samlingskategori skapas", async () => {
    const category = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Tom familjekategori", isFamily: true });

    const del = await request(app)
      .delete(`/api/todo-categories/${category.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);
    expect(del.body.uncategorizedCount).toBe(0);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect((list.body as Array<{ isUncategorizedCollector?: boolean }>).some((c) => c.isUncategorizedCollector)).toBe(false);
  });

  // 2026-08-06, Zaidas rättelse: "detsamma gäller i min egen todo-vy.
  // Okategoriserade uppgifter skall skapa 'Mina uppgifter'" — samma riktiga,
  // auto-skapade samlingskategori-mekanism som familjevyn, bara alltid
  // namngiven "Mina uppgifter" och scopead PER MEDLEM (till skillnad från
  // familjens EN delade per konto) — se getOrCreateUncategorizedCollector.
  it("radera en PERSONLIG kategori med en uppgift: en samlingskategori 'Mina uppgifter' skapas automatiskt, uppgiften flyttas dit", async () => {
    const category = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Träning" });

    const todoId = `todo-orphan-personal-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId, title: "Löpa", createdBy: memberId, assignedTo: memberId,
        ...todoPayload({ personalCategoryId: category.body.id })
      });

    const del = await request(app)
      .delete(`/api/todo-categories/${category.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);
    expect(del.body.uncategorizedCount).toBe(1);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const personalCollector = (list.body as Array<{ id: string; name: string; isFamily: boolean; memberId: string; isUncategorizedCollector?: boolean }>)
      .find((c) => c.isUncategorizedCollector && !c.isFamily);
    expect(personalCollector).toBeDefined();
    expect(personalCollector?.name).toBe("Mina uppgifter");
    expect(personalCollector?.memberId).toBe(memberId);

    const todos = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const todo = (todos.body as Array<{ id: string; personalCategoryId: string | null }>).find((t) => t.id === todoId);
    expect(todo?.personalCategoryId).toBe(personalCollector!.id);
  });

  // En personlig kategori är kontobred (ADR-0019) — flera olika vuxna kan ha
  // skapat en uppgift i den. Var och en ska få sin EGEN "Mina uppgifter",
  // inte dela en gemensam (annars hade den bara synts för en av dem, se
  // getOrCreateUncategorizedCollector:s kommentar om memberId-scopning).
  it("radera en PERSONLIG kategori med uppgifter skapade av TVÅ olika vuxna: var och en får sin EGEN 'Mina uppgifter'", async () => {
    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const parentRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => !r.isChildRole)!.id;
    const thirdAdult = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Tredje föräldern", roleId: parentRoleId, isChild: false, avatarUrl: null, color: null, dashboardTheme: null });
    const thirdAdultId = (thirdAdult.body as { id: string }).id;

    const category = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Delad kategori" });

    const todoA = `todo-owner-a-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoA, title: "Uppgift A", createdBy: memberId, assignedTo: memberId,
        ...todoPayload({ personalCategoryId: category.body.id })
      });
    const todoB = `todo-owner-b-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", thirdAdultId)
      .send({
        id: todoB, title: "Uppgift B", createdBy: thirdAdultId, assignedTo: thirdAdultId,
        ...todoPayload({ personalCategoryId: category.body.id })
      });

    const del = await request(app)
      .delete(`/api/todo-categories/${category.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);
    expect(del.body.uncategorizedCount).toBe(2);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const collectors = (list.body as Array<{ id: string; memberId: string; isUncategorizedCollector?: boolean; isFamily: boolean }>)
      .filter((c) => c.isUncategorizedCollector && !c.isFamily);
    expect(collectors).toHaveLength(2);
    const collectorForMe = collectors.find((c) => c.memberId === memberId)!;
    const collectorForThird = collectors.find((c) => c.memberId === thirdAdultId)!;
    expect(collectorForMe.id).not.toBe(collectorForThird.id);

    const todos = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const bodyTodos = todos.body as Array<{ id: string; personalCategoryId: string | null }>;
    expect(bodyTodos.find((t) => t.id === todoA)?.personalCategoryId).toBe(collectorForMe.id);
    expect(bodyTodos.find((t) => t.id === todoB)?.personalCategoryId).toBe(collectorForThird.id);
  });

  let collectorId: string;

  it("radera en FAMILJEKATEGORI med en uppgift: en samlingskategori skapas automatiskt, namngiven efter kontot, uppgiften flyttas dit", async () => {
    const category = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Hushåll", isFamily: true });

    const todoId = `todo-orphan-family-1-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId, title: "Diska", createdBy: memberId, assignedTo: null,
        ...todoPayload({ personalCategoryId: category.body.id })
      });

    const del = await request(app)
      .delete(`/api/todo-categories/${category.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);
    expect(del.body.uncategorizedCount).toBe(1);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const collector = (list.body as Array<{ id: string; name: string; isFamily: boolean; isUncategorizedCollector?: boolean }>)
      .find((c) => c.isUncategorizedCollector);
    expect(collector).toBeDefined();
    expect(collector?.name).toBe(accountName);
    expect(collector?.isFamily).toBe(true);
    collectorId = collector!.id;

    const todos = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const todo = (todos.body as Array<{ id: string; personalCategoryId: string | null }>).find((t) => t.id === todoId);
    expect(todo?.personalCategoryId).toBe(collectorId);
  });

  it("radera en ANDRA familjekategori med en uppgift: den REDAN SKAPADE samlingskategorin återanvänds, ingen ny skapas", async () => {
    const category = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Trädgård", isFamily: true });

    const todoId = `todo-orphan-family-2-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId, title: "Klippa gräs", createdBy: memberId, assignedTo: null,
        ...todoPayload({ personalCategoryId: category.body.id })
      });

    const del = await request(app)
      .delete(`/api/todo-categories/${category.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);

    const todos = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const todo = (todos.body as Array<{ id: string; personalCategoryId: string | null }>).find((t) => t.id === todoId);
    expect(todo?.personalCategoryId).toBe(collectorId);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const collectors = (list.body as Array<{ isUncategorizedCollector?: boolean }>).filter((c) => c.isUncategorizedCollector);
    expect(collectors).toHaveLength(1);
  });

  it("radera SAMLINGSKATEGORIN själv: dess egna uppgifter nollställs (inte omdirigerade till sig själv)", async () => {
    const del = await request(app)
      .delete(`/api/todo-categories/${collectorId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(del.status).toBe(200);
    expect(del.body.uncategorizedCount).toBe(2);

    const todos = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const stillReferencing = (todos.body as Array<{ personalCategoryId: string | null }>).filter(
      (t) => t.personalCategoryId === collectorId
    );
    expect(stillReferencing).toHaveLength(0);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect((list.body as Array<{ isUncategorizedCollector?: boolean }>).some((c) => c.isUncategorizedCollector)).toBe(false);
  });

  it("en NY familjekategori-radering med kvarvarande uppgifter skapar en FRÄSCH samlingskategori (den gamla är borta)", async () => {
    const category = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Tvätt", isFamily: true });

    const todoId = `todo-orphan-family-3-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId, title: "Tvätta kläder", createdBy: memberId, assignedTo: null,
        ...todoPayload({ personalCategoryId: category.body.id })
      });

    await request(app)
      .delete(`/api/todo-categories/${category.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const newCollector = (list.body as Array<{ id: string; isUncategorizedCollector?: boolean }>).find(
      (c) => c.isUncategorizedCollector
    );
    expect(newCollector).toBeDefined();
    expect(newCollector!.id).not.toBe(collectorId);
  });
});

// 2026-08-06, Zaidas önskemål: "Okategoriserade uppgifter skall skapa 'Mina
// uppgifter'" — gäller inte bara kategoriradering (se ovan) utan även en
// helt vanlig skapelse/redigering där "Ingen kategori" väljs, det vanligaste
// sättet en uppgift faktiskt blir okategoriserad på (TodoCreatorModal.tsx:s
// "Ingen kategori"-val är en förstklassig, alltid tillgänglig knapp).
describe.skipIf(!RUN)("createTodo/updateTodo: en okategoriserad personlig uppgift löser sig direkt till 'Mina uppgifter'", () => {
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

  it("sätter upp konto + ett barn", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "categories-createtodo-int@bmad.test", password: "Lösenord1!", name: "Skaparetest" });
    accessToken = register.body.accessToken as string;
    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Skaparfamiljen" });
    memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const childRoleId = (roles.body as Array<{ id: string; isChildRole: boolean }>).find((r) => r.isChildRole)!.id;
    const child = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Barnet", roleId: childRoleId, isChild: true, avatarUrl: null, color: null, dashboardTheme: null });
    childMemberId = (child.body as { id: string }).id;
  });

  it("skapar en personlig uppgift utan personalCategoryId: löses direkt till en auto-skapad 'Mina uppgifter'", async () => {
    const todoId = `todo-create-uncategorized-${crypto.randomUUID()}`;
    const create = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId, title: "Handla mjölk", createdBy: memberId, assignedTo: memberId,
        ...todoPayload({})
      });
    expect(create.status).toBe(201);

    const todos = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const todo = (todos.body as Array<{ id: string; personalCategoryId: string | null }>).find((t) => t.id === todoId);
    expect(todo?.personalCategoryId).not.toBeNull();

    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const collector = (list.body as Array<{ id: string; name: string; isUncategorizedCollector?: boolean }>)
      .find((c) => c.isUncategorizedCollector);
    expect(collector).toBeDefined();
    expect(collector?.name).toBe("Mina uppgifter");
    expect(todo?.personalCategoryId).toBe(collector!.id);
  });

  it("en FAMILJEN-poolens uppgift (assignedTo:null) rörs INTE — förblir riktigt okategoriserad, ingen samlingskategori", async () => {
    const todoId = `todo-create-family-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId, title: "Handla till alla", createdBy: memberId, assignedTo: null,
        ...todoPayload({})
      });

    const todos = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const todo = (todos.body as Array<{ id: string; personalCategoryId: string | null }>).find((t) => t.id === todoId);
    expect(todo?.personalCategoryId).toBeNull();
  });

  it("en BARN-tilldelad uppgift rörs INTE — förblir null, aldrig omdirigerad till en vuxens 'Mina uppgifter'", async () => {
    const todoId = `todo-create-child-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId, title: "Städa rummet", createdBy: memberId, assignedTo: childMemberId,
        ...todoPayload({})
      });

    const todos = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const todo = (todos.body as Array<{ id: string; personalCategoryId: string | null }>).find((t) => t.id === todoId);
    expect(todo?.personalCategoryId).toBeNull();
  });

  it("redigerar en kategoriserad uppgift till 'Ingen kategori': löses om till 'Mina uppgifter' istället för att bli null", async () => {
    const category = await request(app)
      .post("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ name: "Tillfällig" });

    const todoId = `todo-update-uncategorized-${crypto.randomUUID()}`;
    await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: todoId, title: "Diska", createdBy: memberId, assignedTo: memberId,
        ...todoPayload({ personalCategoryId: category.body.id })
      });

    const patch = await request(app)
      .patch(`/api/todos/${todoId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({ personalCategoryId: null });
    expect(patch.status).toBe(200);

    const todos = await request(app)
      .get("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const todo = (todos.body as Array<{ id: string; personalCategoryId: string | null }>).find((t) => t.id === todoId);
    const list = await request(app)
      .get("/api/todo-categories")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    const collector = (list.body as Array<{ id: string; isUncategorizedCollector?: boolean }>).find((c) => c.isUncategorizedCollector);
    expect(todo?.personalCategoryId).toBe(collector!.id);
  });
});
