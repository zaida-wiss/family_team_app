/**
 * Proaktivt datahälsokontroll-skript (Sprint 8 S5, 2026-07-17)
 *
 * Kör: tsx backend/scripts/checkDataIntegrity.ts
 *
 * Varför: flera produktionsincidenter (2026-07-06, 2026-07-08, 2026-07-15) har
 * upptäckts REAKTIVT — trasig data låg tyst i databasen tills en användare
 * råkade trigga exakt rätt kodväg för att märka det (en roll utan
 * isChildRole, en återkommande mall utan visibleFrom, spöklika kalender-
 * händelser). Det här skriptet letar proaktivt efter samma kända
 * riskmönster, INNAN en familjemedlem upptäcker dem.
 *
 * ENDAST LÄSNING — inga skrivningar någonstans i detta skript. Output
 * granskas manuellt (Zaida/Claude) innan en eventuell åtgärd; skriptet
 * föreslår inte och utför inte några fixar själv.
 *
 * Säkert att köra hur ofta som helst, inget schemalagt ännu — se
 * CLAUDE.md:s Sprint 8 S5.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { RoleModel } from "../src/db/models/Role.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { CalendarModel } from "../src/db/models/Calendar.js";
import { AccountModel } from "../src/db/models/Account.js";

// Samma ord som faktiskt användes i produktion (2026-07-15-incidenten,
// role-child hette "Barn") — inte en uttömmande lista, bara de mönster som
// redan bevisligen förekommit.
const CHILD_ROLE_NAME_PATTERN = /barn|child/i;

async function run() {
  await connectDB();
  let issuesFound = 0;

  console.log("=== 1) Roller vars namn antyder barn-roll men isChildRole !== true ===");
  const roles = await RoleModel.find({}, { _id: 0, __v: 0 });
  const suspiciousRoles = roles.filter(
    (r) => CHILD_ROLE_NAME_PATTERN.test(r.name) && r.isChildRole !== true
  );
  if (suspiciousRoles.length === 0) {
    console.log("  Inga fynd.");
  } else {
    for (const r of suspiciousRoles) {
      console.log(`  ⚠ Roll "${r.name}" (${r.id}, konto ${r.accountId}) — isChildRole: ${r.isChildRole}`);
      issuesFound++;
    }
  }

  console.log("\n=== 2) Återkommande mallar med visibleFrom: null (fungerar aldrig som återkommande) ===");
  const brokenTemplates = await TodoModel.find(
    {
      "recurrence.type": { $ne: "none" },
      recurringSourceId: null,
      deletedAt: null,
      visibleFrom: null
    },
    { _id: 0, id: 1, title: 1, accountId: 1, assignedTo: 1 }
  );
  if (brokenTemplates.length === 0) {
    console.log("  Inga fynd.");
  } else {
    for (const t of brokenTemplates) {
      console.log(`  ⚠ Mall "${t.title}" (${t.id}, konto ${t.accountId}) — visibleFrom saknas`);
      issuesFound++;
    }
  }

  console.log("\n=== 3) Kalenderhändelser med subscriptionId som inte matchar någon prenumeration i samma konto ===");
  const accounts = await AccountModel.find({ deletedAt: null }, { _id: 0, id: 1 });
  for (const account of accounts) {
    const calendars = await CalendarModel.find({ accountId: account.id, deletedAt: null });
    const knownSubscriptionIds = new Set(
      calendars.flatMap((c) => (c.subscriptions ?? []).map((s) => s.id))
    );
    for (const calendar of calendars) {
      for (const event of calendar.events ?? []) {
        if (!event.subscriptionId || event.deletedAt) continue;
        if (!knownSubscriptionIds.has(event.subscriptionId)) {
          console.log(
            `  ⚠ Händelse "${event.title}" (${event.id}, kalender "${calendar.name}"/${calendar.id}, konto ${account.id}) — subscriptionId ${event.subscriptionId} matchar ingen prenumeration i kontot`
          );
          issuesFound++;
        }
      }
    }
  }

  console.log(`\n=== Klart — ${issuesFound} fynd totalt ===`);
  if (issuesFound > 0) {
    console.log("Inget har ändrats (skrivskyddat skript) — granska fynden ovan manuellt innan ev. åtgärd.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
