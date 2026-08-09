/**
 * Integrationstest (2026-08-10, se ADR-0032) — registrering skapar nu
 * automatiskt ett minimalt PERSONLIGT konto (type: "personal", en enda
 * "Ägare"-roll med alla behörigheter, ingen "Barn"-roll) istället för att
 * lämna användaren utan konto tills de klickar "Skapa nytt familjekonto".
 * Det flödet (setupAccount/POST /api/accounts/setup, "skapa en grupp") ska
 * fortsätta fungera EXAKT som innan — verifierat som regression här.
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

describe.skipIf(!RUN)("Personligt konto vid registrering (2026-08-10)", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it("skapar automatiskt ett personligt konto med en Ägare-roll (alla behörigheter), inget familjenamn-steg", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `personal-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Ny Ägare" });
    expect(register.status).toBe(201);

    const memberships = register.body.memberships as Array<{
      member: { id: string; roleId: string };
      account: { id: string; name: string; type: string };
    }>;
    expect(memberships).toHaveLength(1);

    const { member, account } = memberships[0];
    expect(account.type).toBe("personal");
    expect(account.name).toBe("Personligt konto");

    const accessToken = register.body.accessToken as string;
    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", member.id);
    expect(roles.status).toBe(200);

    const allRoles = roles.body as Array<{ name: string; isChildRole: boolean; permissions: Record<string, boolean> }>;
    // Exakt en roll — ingen "Barn"-roll skapas för ett personligt konto.
    expect(allRoles).toHaveLength(1);
    expect(allRoles[0].name).toBe("Ägare");
    expect(allRoles[0].isChildRole).toBe(false);
    const permissionValues = Object.values(allRoles[0].permissions);
    expect(permissionValues.length).toBeGreaterThan(0);
    expect(permissionValues.every((v) => v === true)).toBe(true);
  });

  it("att skapa en grupp (familjekonto) efter registrering fungerar oförändrat och ger två medlemskap totalt", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `grupp-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Ny Grupperare" });
    expect(register.status).toBe(201);
    const accessToken = register.body.accessToken as string;
    expect(register.body.memberships).toHaveLength(1);

    // "Skapa nytt familjekonto" (setupAccount) — helt oförändrat flöde.
    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Familjen Grupperare" });
    expect(setup.status).toBe(201);
    expect(setup.body.membership.account.type).toBe("family");
    expect(setup.body.membership.account.name).toBe("Familjen Grupperare");

    const myMemberships = await request(app)
      .get("/api/members/my-memberships")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(myMemberships.status).toBe(200);
    expect((myMemberships.body as unknown[]).length).toBe(2);
  });
});
