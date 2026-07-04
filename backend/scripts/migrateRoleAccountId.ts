/**
 * Engångsmigration: backfill Role.accountId
 *
 * Kör: tsx backend/scripts/migrateRoleAccountId.ts
 *
 * Varför: RoleModel saknade tidigare ett accountId-fält helt — "vilket konto äger
 * rollen" avgjordes indirekt genom att kolla om en medlem i kontot faktiskt
 * använde rollen (getAllRoles). Det betydde att en helt ny familjs "Barn"-roll
 * (skapad vid setup, men ingen medlem använder den förrän första barnet skapas)
 * var osynlig i GET /api/roles — roll-väljaren i "Familjemedlemmar" visade bara
 * "Förälder", så en ny familj kunde aldrig välja "Barn" för sitt första barn.
 * Se ADR-0009 (som redan flaggade avsaknaden av accountId som en känd begränsning)
 * och sprint-review-2026-07-04-sprint5.md för hur felet upptäcktes och verifierades
 * live mot en riktig nyregistrering.
 *
 * Två pass:
 * 1) Roller som en befintlig medlem faktiskt använder — accountId härleds direkt
 *    från den medlemmen.
 * 2) Konton som efter pass 1 fortfarande saknar en barn-roll helt (den gamla,
 *    ägarlösa "Barn"-rollen hade inga medlemmar och gick inte att matcha) — får
 *    en ny, korrekt kontoscopad "Barn"-roll. Den gamla ägarlösa rollen lämnas
 *    orörd (ofarlig död data, inte kopplad till något konto, syns aldrig).
 *
 * Säkert att köra flera gånger — pass 1 rör bara roller som fortfarande saknar
 * accountId, pass 2 skapar bara en ny roll om kontot verkligen saknar en.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { RoleModel } from "../src/db/models/Role.js";
import { MemberModel } from "../src/db/models/Member.js";
import { AccountModel } from "../src/db/models/Account.js";

const ALL_PERMISSION_KEYS = [
  "canManageMembers", "canManageRoles", "canCreateChildAccounts", "canManageChildTodos",
  "canSeeAllTodos", "canSeeOwnTodos", "canCreateTodos", "canScheduleRecurringTodos",
  "canCompleteAssignedTodos", "canEditAnyTodos", "canDeleteAnyTodos", "canApproveTodos",
  "canSeeAllCalendar", "canSeeOwnCalendar", "canCreateCalendar", "canEditCalendar",
  "canImportCalendar", "canExportCalendar", "canSeeShoppingLists", "canCreateShoppingLists",
  "canEditShoppingLists", "canViewTrash", "canRestoreFromTrash"
];

const CHILD_PERMISSIONS = ["canSeeOwnTodos", "canCompleteAssignedTodos", "canSeeOwnCalendar"];

function makePermissions(enabled: string[]) {
  return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, enabled.includes(k)]));
}

async function run() {
  await connectDB();

  const rolesWithoutAccount = await RoleModel.find({ accountId: { $exists: false } });
  let resolvedViaMember = 0;
  for (const role of rolesWithoutAccount) {
    const member = await MemberModel.findOne({ roleId: role.id });
    if (member) {
      role.accountId = member.accountId;
      await role.save();
      resolvedViaMember++;
    }
  }
  console.log(`Pass 1: ${resolvedViaMember} roller fick accountId härlett från en medlem som använder rollen.`);

  const accounts = await AccountModel.find({ deletedAt: null });
  let createdNewChildRole = 0;
  for (const account of accounts) {
    const hasChildRole = await RoleModel.exists({ accountId: account.id, isChildRole: true });
    if (hasChildRole) continue;
    await RoleModel.create({
      id: `role-${crypto.randomUUID()}`,
      accountId: account.id,
      name: "Barn",
      isChildRole: true,
      permissions: makePermissions(CHILD_PERMISSIONS)
    });
    createdNewChildRole++;
  }
  console.log(`Pass 2: ${createdNewChildRole} konton saknade en barnroll helt efter pass 1 — en ny skapad åt dem.`);

  const stillOrphaned = await RoleModel.countDocuments({ accountId: { $exists: false } });
  console.log(`Kvar utan accountId (ingen medlem använder dem, inget konto behövde en ersättning): ${stillOrphaned} — ofarlig död data.`);

  console.log("\nKlart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
