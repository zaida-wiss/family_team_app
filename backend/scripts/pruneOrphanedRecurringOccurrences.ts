/**
 * Engångsstädning: kvarhängande occurrences av redan raderade återkommande mallar
 *
 * Kör: tsx backend/scripts/pruneOrphanedRecurringOccurrences.ts
 *
 * Varför: "Ta bort serien" (RecurringTodosSettings.tsx) raderade historiskt
 * bara MALLEN (recurringSourceId===null) — en redan genererad dagens-
 * occurrence är ett eget, separat Todo-dokument (recurringSourceId pekar på
 * mallen) och fanns kvar helt orört. Fixat i koden 2026-07-28
 * (useTodosState.ts:s softDeleteTodo raderar nu occurrences av samma mall i
 * samma svep), men den fixen gäller bara FRAMTIDA raderingar — redan
 * övergivna occurrences från INNAN fixen ligger fortfarande kvar som
 * synliga, aktiva uppgifter (Zaidas fynd 2026-07-28: "i barnläget behöver
 * jag kunna få bort gamla raderade todos").
 *
 * Mjuk-raderar (deletedAt satt till NU, deletedBy null — ingen enskild
 * medlem "utförde" denna städning) alla Todo-dokument vars recurringSourceId
 * pekar på en mall som redan är soft-deleted, och som själva ännu inte är
 * det. Rör ALDRIG mallen själv eller occurrences av mallar som fortfarande
 * är aktiva. Säkert att köra flera gånger — matchar bara deletedAt:null.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { TodoModel } from "../src/db/models/Todo.js";

async function run() {
  await connectDB();

  const deletedTemplates = await TodoModel.find(
    { recurringSourceId: null, "recurrence.type": { $exists: true, $ne: "none" }, deletedAt: { $ne: null } },
    { id: 1 }
  ).lean();
  const deletedTemplateIds = deletedTemplates.map((t) => t.id);

  const now = new Date().toISOString();
  const result = await TodoModel.updateMany(
    { recurringSourceId: { $in: deletedTemplateIds }, deletedAt: null },
    { $set: { deletedAt: now, deletedBy: null } }
  );

  console.log(
    `${deletedTemplates.length} raderade mallar kontrollerade, ${result.modifiedCount} kvarhängande occurrences mjuk-raderade.`
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
