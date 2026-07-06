/**
 * Engångsmigration: RecurrenceRule "weekly"/"interval" → kombinerad "recurring"
 *
 * Kör: tsx backend/scripts/migrateRecurrenceRule.ts
 *
 * Varför: RecurrenceRule byggdes om (ADR-0015) från två separata varianter
 * (`{type:"weekly", daysOfWeek}` och `{type:"interval", every, unit}`) till en
 * enda kombinerad `{type:"recurring", unit, every, daysOfWeek}` — så att
 * veckodagsval och intervall (varannan/var tredje/…) kan kombineras. Todo.recurrence
 * lagras som Schema.Types.Mixed (fri JSON) i MongoDB, så befintlig produktionsdata
 * i den gamla formen måste skrivas om — appens kod har ingen läsväg kvar för
 * "weekly"/"interval" efter denna ändring, så omigrerade återkommande mallar
 * slutar tyst generera dagens todos.
 *
 * Säkert att köra flera gånger — rör bara dokument vars recurrence.type
 * fortfarande är "weekly" eller "interval".
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { TodoModel } from "../src/db/models/Todo.js";
import type { RecurrenceRule, Weekday } from "../../shared/types.js";

type OldWeekly = { type: "weekly"; daysOfWeek: Weekday[] };
type OldInterval = { type: "interval"; every: number; unit: "day" | "week" };

async function run() {
  await connectDB();

  const weeklyTodos = await TodoModel.find({ "recurrence.type": "weekly" });
  for (const todo of weeklyTodos) {
    const old = todo.recurrence as unknown as OldWeekly;
    const migrated: RecurrenceRule = { type: "recurring", unit: "week", every: 1, daysOfWeek: old.daysOfWeek };
    todo.recurrence = migrated;
    await todo.save();
  }
  console.log(`"weekly" → "recurring": ${weeklyTodos.length} todos migrerade.`);

  const intervalTodos = await TodoModel.find({ "recurrence.type": "interval" });
  for (const todo of intervalTodos) {
    const old = todo.recurrence as unknown as OldInterval;
    // Gamla "interval"-formen hade inget veckodags-koncept alls (bara ett
    // dagräknat intervall) — den nya formen KRÄVER minst en vald veckodag när
    // unit är "week" (schemats .refine i shared/schemas.ts). Att bara kopiera
    // old.unit rakt av för unit:"week" skapar ett ogiltigt daysOfWeek:null-
    // tillstånd (bugg hittad 2026-07-06, se incidents/). "Var N:e vecka" utan
    // specifik veckodag är semantiskt identiskt med "var N*7:e dag" — så det
    // skrivs om till unit:"day" istället för att gissa veckodagar.
    const migrated: RecurrenceRule =
      old.unit === "week"
        ? { type: "recurring", unit: "day", every: old.every * 7, daysOfWeek: null }
        : { type: "recurring", unit: old.unit, every: old.every, daysOfWeek: null };
    todo.recurrence = migrated;
    await todo.save();
  }
  console.log(`"interval" → "recurring": ${intervalTodos.length} todos migrerade.`);

  const remaining = await TodoModel.countDocuments({
    $or: [{ "recurrence.type": "weekly" }, { "recurrence.type": "interval" }]
  });
  console.log(`Kvar i gammal form (bör vara 0): ${remaining}`);

  console.log("\nKlart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
