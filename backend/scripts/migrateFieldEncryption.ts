/**
 * Engångsmigration: kryptera befintlig klartextdata (ADR-0014)
 *
 * Kör: tsx backend/scripts/migrateFieldEncryption.ts
 *
 * Varför: fält-kryptering (calendarsService.ts, todosService.ts, rewardsService.ts,
 * calendarSubscriptionsService.ts) krypterar bara vid skrivning från och med commit
 * f37dd40 — data skriven innan dess ligger fortfarande i klartext i MongoDB. Det här
 * skriptet krypterar all befintlig data en gång: kalenderhändelsers title/notes,
 * kalenderprenumerationers url, todos title/rejectedReason, rewards title.
 *
 * Säkert att köra flera gånger: decryptField/encryptField-mönstret använder ett
 * "v1:"-prefix för krypterad data — fält som redan har prefixet hoppas över.
 *
 * 2026-07-28 tillägg 1: krypterar även Todo.subtasks[].title (glömdes i den
 * ursprungliga migreringen — subtask-titlar fick fält-kryptering i koden
 * först 2026-07-28, se todosService.ts). Samma idempotens-mönster.
 *
 * 2026-07-28 tillägg 2: krypterar även Todo.notes (fanns i koden sedan
 * 2026-07-05 men glömdes helt i den ursprungliga migreringen — upptäckt vid
 * samma genomgång som tillägg 1) samt mallbibliotekets TodoTemplate/
 * TodoCategoryTemplate title/notes/subtasks[].title (fick fält-kryptering i
 * koden först 2026-07-28, se todoTemplatesService.ts).
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { CalendarModel } from "../src/db/models/Calendar.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { RewardModel } from "../src/db/models/Reward.js";
import { TodoTemplateModel } from "../src/db/models/TodoTemplate.js";
import { TodoCategoryTemplateModel } from "../src/db/models/TodoCategoryTemplate.js";
import { encryptField, encryptNullable } from "../src/utils/fieldEncryption.js";

const ENCRYPTED_PREFIX = "v1:";

function needsEncryption(value: string | null | undefined): value is string {
  return typeof value === "string" && !value.startsWith(ENCRYPTED_PREFIX);
}

async function migrateCalendars() {
  const calendars = await CalendarModel.find({ accountId: { $ne: null } });
  let updatedCalendars = 0;
  let updatedEvents = 0;
  let updatedSubscriptions = 0;
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
    for (const sub of calendar.subscriptions ?? []) {
      if (needsEncryption(sub.url)) {
        sub.url = encryptField(calendar.accountId!, sub.url);
        changed = true;
        updatedSubscriptions++;
      }
    }
    if (changed) {
      calendar.markModified("events");
      calendar.markModified("subscriptions");
      await calendar.save();
      updatedCalendars++;
    }
  }

  console.log(
    `Kalendrar: ${updatedCalendars} kalendrar uppdaterade, ${updatedEvents} händelsefält krypterade, ${updatedSubscriptions} prenumerations-url:er krypterade, ${skippedNoAccount} kalendrar utan accountId hoppade över.`
  );
}

async function migrateTodos() {
  const todos = await TodoModel.find({ accountId: { $ne: null } });
  let updated = 0;
  let updatedSubtaskTitles = 0;
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
    if (needsEncryption(todo.notes)) {
      todo.notes = encryptNullable(todo.accountId!, todo.notes) ?? null;
      changed = true;
    }
    let subtasksChanged = false;
    for (const subtask of todo.subtasks ?? []) {
      if (needsEncryption(subtask.title)) {
        subtask.title = encryptField(todo.accountId!, subtask.title);
        subtasksChanged = true;
        updatedSubtaskTitles++;
      }
    }
    if (subtasksChanged) {
      todo.markModified("subtasks");
      changed = true;
    }
    if (changed) {
      await todo.save();
      updated++;
    }
  }

  console.log(
    `Todos: ${updated} uppdaterade, ${updatedSubtaskTitles} delmomentstitlar krypterade, ${withoutAccount} utan accountId hoppade över.`
  );
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

async function migrateTodoTemplates() {
  const templates = await TodoTemplateModel.find({ accountId: { $ne: null } });
  let updated = 0;
  let updatedSubtaskTitles = 0;

  for (const template of templates) {
    let changed = false;
    if (needsEncryption(template.title)) {
      template.title = encryptField(template.accountId, template.title);
      changed = true;
    }
    if (needsEncryption(template.notes)) {
      template.notes = encryptNullable(template.accountId, template.notes) ?? null;
      changed = true;
    }
    for (const subtask of template.subtasks ?? []) {
      if (needsEncryption(subtask.title)) {
        subtask.title = encryptField(template.accountId, subtask.title);
        changed = true;
        updatedSubtaskTitles++;
      }
    }
    if (changed) {
      template.markModified("subtasks");
      await template.save();
      updated++;
    }
  }

  const categoryTemplates = await TodoCategoryTemplateModel.find({ accountId: { $ne: null } });
  let updatedCategories = 0;
  let updatedCategoryTaskTitles = 0;
  let updatedCategorySubtaskTitles = 0;

  for (const categoryTemplate of categoryTemplates) {
    let changed = false;
    for (const task of categoryTemplate.tasks ?? []) {
      if (needsEncryption(task.title)) {
        task.title = encryptField(categoryTemplate.accountId, task.title);
        changed = true;
        updatedCategoryTaskTitles++;
      }
      if (needsEncryption(task.notes)) {
        task.notes = encryptNullable(categoryTemplate.accountId, task.notes) ?? null;
        changed = true;
      }
      for (const subtask of task.subtasks ?? []) {
        if (needsEncryption(subtask.title)) {
          subtask.title = encryptField(categoryTemplate.accountId, subtask.title);
          changed = true;
          updatedCategorySubtaskTitles++;
        }
      }
    }
    if (changed) {
      categoryTemplate.markModified("tasks");
      await categoryTemplate.save();
      updatedCategories++;
    }
  }

  console.log(
    `Uppgiftsmallar: ${updated} uppdaterade, ${updatedSubtaskTitles} delmomentstitlar krypterade. Kategori-mallar: ${updatedCategories} uppdaterade, ${updatedCategoryTaskTitles} uppgiftstitlar + ${updatedCategorySubtaskTitles} delmomentstitlar krypterade.`
  );
}

async function run() {
  await connectDB();
  await migrateCalendars();
  await migrateTodos();
  await migrateRewards();
  await migrateTodoTemplates();
  console.log("\nKlart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
