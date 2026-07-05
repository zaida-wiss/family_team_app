/**
 * Integrationstest: GET /api/accounts/:id/export (GDPR Art. 20-export) ska
 * innehålla ALL kontots data, inte bara en delmängd. Zaida frågade uttryckligen
 * om allt ingår — genomgång 2026-07-05 visade att todoCategories, rewardShop,
 * purchasedRewards, timedTasks/timedAttempts, auditLog, invitations och users
 * (kontots inloggningsprofiler) saknades helt i exportAccount, trots att alla
 * är kontoscopad data. Samtidigt: users-listan får ALDRIG innehålla
 * passwordHash/tokenVersion/lösenordsåterställningsfält, och invitations får
 * aldrig innehålla den riktiga inbjudningstoken — en läckt export ska inte
 * kunna missbrukas för att logga in som någon eller godkänna en inbjudan.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 *
 * Täcker även: exportAccount returnerade tidigare de RÅA fält-krypterade
 * (ADR-0014) Mongoose-dokumenten rakt av — todos title/rejectedReason/notes,
 * kalenderhändelsers title/notes, kalenderprenumerationers url och belöningars
 * title kom ut som oläslig chiffertext (v1:<iv>:<tag>:…) i exporten istället
 * för klartext, vilket gör en GDPR-dataportabilitets-export värdelös för de
 * fälten. Upptäckt vid Zaidas fråga om hur en export+import av krypterad
 * kalenderdata skulle fungera.
 */

import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDB } from "../src/db/connection.js";
import { TodoCategoryModel } from "../src/db/models/TodoCategory.js";
import { InvitationModel } from "../src/db/models/Invitation.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("GET /api/accounts/:id/export innehåller all kontodata", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it("inkluderar todoCategories/invitations och exkluderar hemliga fält", async () => {
    const register = await request(app)
      .post("/api/auth/register")
      .send({ email: "export-int@bmad.test", password: "Lösenord1!", name: "Exporttest" });
    expect(register.status).toBe(201);
    const accessToken = register.body.accessToken as string;

    const setup = await request(app)
      .post("/api/accounts/setup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Exportfamiljen" });
    expect(setup.status).toBe(201);
    const accountId = (setup.body as { membership: { account: { id: string } } }).membership.account.id;
    const memberId = (setup.body as { membership: { member: { id: string } } }).membership.member.id;

    await TodoCategoryModel.create({
      id: "cat-export-test",
      accountId,
      memberId,
      name: "Export-test-kategori",
      createdAt: new Date().toISOString(),
      deletedAt: null,
      deletedBy: null
    });
    await InvitationModel.create({
      id: "inv-export-test",
      accountId,
      invitedEmail: "invited@bmad.test",
      invitedByMemberId: memberId,
      memberName: "Inbjuden",
      roleId: "role-x",
      isChild: false,
      token: "hemlig-token-far-aldrig-lacka",
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString()
    });

    const createTodo = await request(app)
      .post("/api/todos")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId)
      .send({
        id: "todo-export-crypt-test",
        title: "Hemlig uppgiftstitel",
        createdBy: memberId,
        assignedTo: memberId,
        isShared: false,
        status: "pending",
        starValue: 0,
        visual: { type: "lucide-icon", value: "Star" },
        recurrence: { type: "none" },
        recurringSourceId: null,
        occurrenceDate: null,
        visibleFrom: null,
        expiresAt: null,
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: null,
        deletedAt: null,
        deletedBy: null,
        notes: "Hemlig anteckning"
      });
    expect(createTodo.status).toBe(201);

    const res = await request(app)
      .get(`/api/accounts/${accountId}/export`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-member-id", memberId);

    expect(res.status).toBe(200);

    // Fält-krypterade värden ska vara läsbar klartext i exporten, inte den
    // råa lagringsformen (v1:<iv>:<tag>:<ciphertext>).
    const exportedTodo = (res.body.todos as Array<{ id: string; title: string; notes: string }>).find(
      (t) => t.id === "todo-export-crypt-test"
    );
    expect(exportedTodo?.title).toBe("Hemlig uppgiftstitel");
    expect(exportedTodo?.notes).toBe("Hemlig anteckning");
    expect(exportedTodo?.title.startsWith("v1:")).toBe(false);

    expect(res.body.todoCategories).toHaveLength(1);
    expect(res.body.todoCategories[0].name).toBe("Export-test-kategori");

    expect(res.body.invitations).toHaveLength(1);
    expect(res.body.invitations[0].invitedEmail).toBe("invited@bmad.test");
    expect(res.body.invitations[0].token).toBeUndefined();

    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].email).toBe("export-int@bmad.test");
    expect(res.body.users[0].passwordHash).toBeUndefined();
    expect(res.body.users[0].tokenVersion).toBeUndefined();
    expect(res.body.users[0].passwordResetTokenHash).toBeUndefined();

    // Fanns redan innan — regressionsskydd så att det inte försvinner igen.
    expect(res.body.purchasedRewards).toEqual([]);
    expect(res.body.timedTasks).toEqual([]);
    expect(res.body.timedAttempts).toEqual([]);
    expect(res.body.auditLog).toEqual([]);
  });
});
