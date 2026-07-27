/**
 * Integrationstest (2026-07-27, Zaidas önskemål: "när ett nytt familjekonto
 * registreras så skall den personen få adminbehörigheter och ha tillgång
 * till allt i roller och behörigheter") — kontoskaparens automatiskt skapade
 * "Förälder"-roll ska ha ALLA behörigheter satta till true, inte en kuraterad
 * delmängd. Tidigare saknade den tre behörigheter (canSeeOwnTodos/
 * canCompleteAssignedTodos/canSeeOwnCalendar) som av misstag bara låg i
 * barnrollens permissionslista.
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

describe.skipIf(!RUN)("Kontoskaparens roll får alla behörigheter (2026-07-27)", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it("Förälder-rollen som skapas vid registrering har samtliga behörigheter satta till true", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: `admin-perms-${crypto.randomUUID()}@bmad.test`, password: "Losenord1!", name: "Ny Kontoskapare" });
    expect(register.status).toBe(201);
    const accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Nya familjen" });
    expect(setup.status).toBe(201);
    const memberId = setup.body.membership.member.id as string;

    const roles = await request(app)
      .get("/api/roles")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);
    expect(roles.status).toBe(200);

    const parentRole = (roles.body as Array<{ name: string; isChildRole: boolean; permissions: Record<string, boolean> }>)
      .find((r) => !r.isChildRole)!;
    expect(parentRole).toBeDefined();

    const permissionValues = Object.values(parentRole.permissions);
    expect(permissionValues.length).toBeGreaterThan(0);
    expect(permissionValues.every((v) => v === true)).toBe(true);
  });
});
