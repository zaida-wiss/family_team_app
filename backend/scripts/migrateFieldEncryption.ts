/**
 * Engångsmigration: kryptera befintlig klartextdata (ADR-0014)
 *
 * Kör: tsx backend/scripts/migrateFieldEncryption.ts
 *
 * Varför: fält-kryptering (calendarsService.ts, todosService.ts, rewardsService.ts)
 * krypterar bara vid skrivning från och med commit f37dd40 — data skriven innan
 * dess ligger fortfarande i klartext i MongoDB. Det här skriptet krypterar all
 * befintlig data en gång: kalenderhändelsers title/notes, todos title/rejectedReason,
 * rewards title.
 *
 * Säkert att köra flera gånger: decryptField/encryptField-mönstret använder ett
 * "v1:"-prefix för krypterad data — fält som redan har prefixet hoppas över.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { CalendarModel } from "../src/db/models/Calendar.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { RewardModel } from "../src/db/models/Reward.js";
import { encryptField, encryptNullable } from "../src/utils/fieldEncryption.js";

const ENCRYPTED_PREFIX = "v1:";

function needsEncryption(value: string | null | undefined): value is string {
  return typeof value === "string" && !value.startsWith(ENCRYPTED_PREFIX);
}

async function migrateCalendars() {
  const calendars = await CalendarModel.find({ accountId: { $ne: null } });
  let updatedCalendars = 0;
  let updatedEvents = 0;
  let skippedNoAccount = 0;

  const withoutAccount = await CalendarModel.countDocuments({ accountId: null });
  skippedNoAccount += withoutAccount;

  for (const calendar of calendars) {
    let changed = false;
    for (const event of calendar.events) {
      if (needsEncryption(event.title)) {
        event.title = encryptField(calendar.accountId!, event.title);
        changed = true;
        updatedEvents++;
      }
      if (needsEncryption(event.notes)) {
        event.notes = encryptNullable(calendar.accountId!, event.notes) ?? null;
        changed = true;
        updatedEvents++;
      }
    }
    if (changed) {
      await calendar.save();
      updatedCalendars++;
    }
  }

  console.log(
    `Kalendrar: ${updatedCalendars} kalendrar uppdaterade, ${updatedEvents} händelsefält krypterade, ${skippedNoAccount} kalendrar utan accountId hoppade över.`
  );
}

async function migrateTodos() {
  const todos = await TodoModel.find({ accountId: { $ne: null } });
  let updated = 0;
  const withoutAccount = await TodoModel.countDocuments({ accountId: null });

  for (const todo of todos) {
    let changed = false;
    if (needsEncryption(todo.title)) {
      todo.title = encryptField(todo.accountId!, todo.title);
      changed = true;
    }
    if (needsEncryption(todo.rejectedReason)) {
      todo.rejectedReason = encryptNullable(todo.accountId!, todo.rejectedReason) ?? null;
      changed = true;
    }
    if (changed) {
      await todo.save();
      updated++;
    }
  }

  console.log(`Todos: ${updated} uppdaterade, ${withoutAccount} utan accountId hoppade över.`);
}

async function migrateRewards() {
  const rewards = await RewardModel.find({ accountId: { $ne: null } });
  let updated = 0;
  const withoutAccount = await RewardModel.countDocuments({ accountId: null });

  for (const reward of rewards) {
    if (needsEncryption(reward.title)) {
      reward.title = encryptField(reward.accountId!, reward.title);
      await reward.save();
      updated++;
    }
  }

  console.log(`Rewards: ${updated} uppdaterade, ${withoutAccount} utan accountId hoppade över.`);
}

async function run() {
  await connectDB();
  await migrateCalendars();
  await migrateTodos();
  await migrateRewards();
  console.log("\nKlart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
