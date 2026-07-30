/**
 * Engångsmigration: backfill Role.permissions.canSeeMembers = true
 *
 * Kör: tsx backend/scripts/migrateCanSeeMembersDefaultTrue.ts
 *
 * Varför: 2026-07-30, Zaidas fynd: "det verkar endast vara admin som kan se
 * medlemsvyn... jag vill att alla familjemedlemmar skall kunna se den, och
 * möjlighet att välja bort det alternativet på en egen roll" — Medlemmar-
 * panelen (nav-ikonen + listan + klicka in på en annan medlems dashboard)
 * var felaktigt gated bakom canManageMembers. Ny, egen behörighet
 * `canSeeMembers` (shared/permissions.ts:s canSeeMembersPanel) styr detta nu
 * separat — och är MEDVETET default PÅ (opt-out), till skillnad från appens
 * övriga behörigheter (default AV, opt-in): en roll som SAKNAR nyckeln helt
 * (alla roller skapade innan detta fält fanns) tolkas redan korrekt som
 * "får se" av canSeeMembersPanel, så produktionen är INTE trasig utan denna
 * migrering — men RoleEditor.tsx:s kryssruta läser nyckeln direkt
 * (`role.permissions[key]`), inte via canSeeMembersPanel:s fallback-logik,
 * så en befintlig rolls "Se medlemmar"-kryssruta hade av misstag visats
 * OKRYSSAD i UI:t trots att medlemmen faktiskt kan se panelen. Detta skript
 * skriver in `true` explicit så UI:t och den faktiska åtkomsten stämmer
 * överens, utan att röra någon annan behörighet.
 *
 * Säkert att köra flera gånger — rör bara roller som saknar nyckeln helt
 * eller redan har den satt till true; en roll där en admin uttryckligen
 * redan satt canSeeMembers: false (ett medvetet val, gjort EFTER denna
 * migrering) rörs aldrig.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { RoleModel } from "../src/db/models/Role.js";

async function run() {
  await connectDB();

  const roles = await RoleModel.find({});
  let updated = 0;
  for (const role of roles) {
    if (role.permissions.canSeeMembers === false) continue;
    if (role.permissions.canSeeMembers === true) continue;
    role.permissions = { ...role.permissions, canSeeMembers: true };
    role.markModified("permissions");
    await role.save();
    updated++;
  }

  console.log(`${updated} roller fick canSeeMembers: true explicit satt (av ${roles.length} totalt).`);
  console.log("Klart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
