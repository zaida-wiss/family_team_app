/**
 * Engångsmigration: backfill Member.dashboardTheme för borttagna vuxenteman
 *
 * Kör: tsx backend/scripts/migrateRemovedAdultThemes.ts
 *
 * Varför: Zaidas beslut 2026-07-09 — fyra av de fem ursprungliga vuxentemana
 * (Fokus/"focus", Varm/"warm", Mörk/"dark", Natur/"nature") togs bort helt ur
 * DashboardThemeIdSchema/temaväljaren, bara Klar ("clear") behölls tillsammans
 * med de tre nya (Solnedgång/Turkos/Lagun). Skälet var delvis ett upptäckt fel
 * samma dag — --c0…--c4 (som .todos-bubble-header__title och
 * .todo-thread__ball förlitar sig på) hade aldrig definierats för dessa fem
 * teman, så rubriken/bubbelfyllningen var osynlig i praktiken för alla fem.
 *
 * En medlem som redan har dashboardTheme satt till ett av de borttagna
 * värdena skulle annars falla igenom Zod-valideringen (DashboardThemeIdSchema)
 * vid nästa PATCH/spara av medlemmen, och temaväljaren har inget sätt att visa
 * eller välja om ett värde som inte längre finns i listan. Skriptet backfyller
 * sådana medlemmar till "clear" (samma tema barn/vuxen-defaultvärdena i
 * accountsService.ts/invitationsService.ts/seed.ts redan bytts till samma dag).
 *
 * Säkert att köra flera gånger — rör bara medlemmar vars dashboardTheme
 * fortfarande är ett av de fyra borttagna värdena.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { MemberModel } from "../src/db/models/Member.js";

const REMOVED_THEME_IDS = ["focus", "warm", "dark", "nature"];

async function run() {
  await connectDB();

  const result = await MemberModel.updateMany(
    { dashboardTheme: { $in: REMOVED_THEME_IDS } },
    { $set: { dashboardTheme: "clear" } }
  );
  console.log(
    `${result.modifiedCount} medlemmar hade ett borttaget vuxentema (${REMOVED_THEME_IDS.join(", ")}) satt — flyttade till "clear".`
  );

  console.log("\nKlart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
