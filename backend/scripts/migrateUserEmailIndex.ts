/**
 * Engångsmigration: byt User.email:s index mot ett partiellt unikt index
 *
 * Kör: tsx backend/scripts/migrateUserEmailIndex.ts
 *
 * Varför: Barn-inloggning (2026-07-22, ADR se CLAUDE.md) — email är nu
 * VALFRI på User (barn har email:null, egen inloggning via username istället,
 * se authService.ts:s childLogin). Det GAMLA indexet (från när email var
 * required+unique) tillåter bara ETT dokument med email:null totalt — ett
 * ANDRA barn i produktion skulle få ett dupliceringsfel när dess inloggning
 * skapas (membersService.ts:s setChildCredentials), tills detta skript körts.
 * Modellen definierar redan det nya indexet (email_partial_unique, bara
 * STRÄNG-värden) — det här skriptet droppar bara det gamla `email_1` som
 * annars ligger kvar och blockerar, och synkar sedan om mot modellens
 * definition på en gång istället för att vänta på nästa serveromstart.
 *
 * Säkert att köra flera gånger — dropIndex är no-op (loggar bara) om det
 * gamla indexet redan är borta.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { UserModel } from "../src/db/models/User.js";

async function run() {
  await connectDB();

  try {
    await UserModel.collection.dropIndex("email_1");
    console.log('Gammalt index "email_1" (required+unique, blockerade flera email:null) borttaget.');
  } catch (err) {
    const code = (err as { codeName?: string })?.codeName;
    if (code === "IndexNotFound") {
      console.log('Inget gammalt "email_1"-index hittades — redan borttaget eller aldrig skapat.');
    } else {
      throw err;
    }
  }

  await UserModel.syncIndexes();
  console.log("Index synkade mot modellens definition (inkl. det nya partiella email_partial_unique).");

  console.log("\nKlart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
