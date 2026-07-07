/**
 * Engångsstädning (2026-07-07): mjuk-raderade PRENUMERERADE kalenderhändelser
 * har aldrig tagits bort ur calendar.events — bara datum-gamla gjorde det.
 * Ett käll-flöde vars UID:n inte matchade tidigare sparade fick arrayen att
 * växa obegränsat vid varje timmes hourly-synk (server.ts syncAllSubscriptions)
 * — grundorsaken till upprepade minneskrascher i produktion. Koden är fixad
 * (calendarSubscriptionsService.ts pruneOldEvents), men fixen förhindrar bara
 * FRAMTIDA tillväxt — detta skript städar bort det som redan hunnit ansamlas.
 *
 * Kör: tsx backend/scripts/pruneGhostSubscriptionEvents.ts
 *
 * Säkert att köra flera gånger (idempotent) — tar ENDAST bort händelser som
 * redan är mjuk-raderade (deletedAt satt) OCH kommer från en prenumeration
 * (subscriptionId satt). Rör aldrig aktiva händelser eller manuellt skapade
 * händelser.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { CalendarModel } from "../src/db/models/Calendar.js";

await connectDB();

const calendars = await CalendarModel.find({});
let totalRemoved = 0;
let calendarsChanged = 0;

for (const cal of calendars) {
  const before = cal.events.length;
  cal.events = (cal.events as any[]).filter((ev) => !(ev.subscriptionId && ev.deletedAt)) as any;
  const removed = before - cal.events.length;
  if (removed > 0) {
    cal.markModified("events");
    await cal.save();
    calendarsChanged++;
    totalRemoved += removed;
    console.log(`Kalender ${cal.id}: ${before} → ${cal.events.length} händelser (${removed} spökposter borttagna)`);
  }
}

console.log(`\nKlart. ${calendarsChanged} kalender(ar) städade, ${totalRemoved} spökposter totalt borttagna.`);
await mongoose.disconnect();
