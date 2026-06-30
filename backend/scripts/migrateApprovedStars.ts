/**
 * Engångsmigration: backfill member.approvedStars
 *
 * Kör: tsx backend/scripts/migrateApprovedStars.ts
 *
 * Varför: approvedStars-fältet lades till efter att befintliga todos redan
 * godkänts. Nya godkännanden inkrementerar fältet via $inc, men gamla
 * konton har approvedStars=0. Det här skriptet summerar alla godkända
 * todos per barn och sätter rätt värde en gång.
 *
 * Säkert att köra flera gånger: använder $max så att räknaren aldrig
 * minskas om nyare godkännanden redan har gett ett högre värde.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { MemberModel } from "../src/db/models/Member.js";

async function run() {
  await connectDB();

  const results: { _id: string; total: number }[] = await TodoModel.aggregate([
    {
      $match: {
        status: "approved",
        deletedAt: null,
        assignedTo: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$assignedTo",
        total: { $sum: "$starValue" },
      },
    },
  ]);

  console.log(`Hittade ${results.length} barn med godkända todos.`);

  let updated = 0;
  let skipped = 0;

  for (const { _id: memberId, total } of results) {
    const member = await MemberModel.findOne({ id: memberId });
    if (!member) {
      console.log(`  Hoppar över ${memberId} — member hittades inte`);
      skipped++;
      continue;
    }

    const current = member.approvedStars ?? 0;
    const newValue = Math.max(current, total);

    if (newValue === current) {
      console.log(`  ${member.name}: redan korrekt (${current} stjärnor)`);
      skipped++;
      continue;
    }

    await MemberModel.updateOne({ id: memberId }, { $set: { approvedStars: newValue } });
    console.log(`  ${member.name}: ${current} → ${newValue} stjärnor`);
    updated++;
  }

  console.log(`\nKlart: ${updated} uppdaterade, ${skipped} oförändrade.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
