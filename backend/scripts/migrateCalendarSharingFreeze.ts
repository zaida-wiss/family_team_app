/**
 * Engångsmigration: frys nuvarande kalendersynlighet till explicit sharedWith
 *
 * Kör: tsx backend/scripts/migrateCalendarSharingFreeze.ts
 *
 * Varför: 2026-08-11, Zaidas beslut (se docs/engineering-os/08-documentation/
 * records/discussions/2026-08-11-installningar-familjekonto-omorganisation.md)
 * — canSeeAllCalendar (rollbehörighet, default på för förälder/admin)
 * bypassar inte längre andra VUXNAS kalendrar, bara barns (föräldratillsyn).
 * Utan denna migrering skulle varje vuxens kalender som idag syns för
 * resten av familjen ENDAST via canSeeAllCalendar-bypassen plötsligt bli
 * osynlig för dem den dagen ändringen går live — en riktig, synlig
 * beteendeförändring för befintliga användare, inte bara ny kod.
 *
 * Det här skriptet skriver in DAGENS faktiska synlighet explicit i
 * sharedWith INNAN omkopplingen: för varje kalender ägd av en VUXEN, lägg
 * till en {memberId, access:"view"}-post för varje ANNAN aktiv VUXEN
 * medlem i samma konto som idag har canSeeAllCalendar (dvs. redan ser
 * kalendern). Kalendrar ägda av BARN rörs inte — de fortsätter vara
 * synliga för canSeeAllCalendar-roller precis som innan, ingen migrering
 * behövs där.
 *
 * Säkert att köra flera gånger — lägger bara till en delning om den redan
 * INTE finns (rör aldrig en redan existerande sharedWith-post, t.ex. en
 * `edit`-behörighet en admin satt manuellt).
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { CalendarModel } from "../src/db/models/Calendar.js";
import { MemberModel } from "../src/db/models/Member.js";
import { RoleModel } from "../src/db/models/Role.js";

async function run() {
  await connectDB();

  const calendars = await CalendarModel.find({ deletedAt: null });
  let updatedCalendars = 0;
  let addedShares = 0;

  for (const calendar of calendars) {
    const owner = await MemberModel.findOne({ id: calendar.ownerId, deletedAt: null });
    if (!owner || owner.isChild) continue;

    // Kalendern ägs redan av en vuxen — nästa steg är att hitta ANDRA vuxna
    // i samma konto som idag ser den via canSeeAllCalendar.
    const otherAdults = await MemberModel.find({
      accountId: calendar.accountId,
      id: { $ne: owner.id },
      isChild: false,
      deletedAt: null
    });

    let changed = false;
    for (const adult of otherAdults) {
      const adultRole = await RoleModel.findOne({ id: adult.roleId, accountId: calendar.accountId });
      if (!adultRole?.permissions.canSeeAllCalendar) continue;
      if (calendar.sharedWith.some((s) => s.memberId === adult.id)) continue;

      calendar.sharedWith.push({ memberId: adult.id, access: "view" });
      changed = true;
      addedShares++;
    }

    if (changed) {
      calendar.markModified("sharedWith");
      await calendar.save();
      updatedCalendars++;
    }
  }

  console.log(`${addedShares} delningar tillagda på ${updatedCalendars} kalendrar (av ${calendars.length} totalt).`);
  console.log("Klart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
