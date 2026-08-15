/**
 * Engångsmigration: backfyll kategori åt redan existerande, kategorilösa
 * vuxen-tilldelade todos
 *
 * Kör: tsx backend/scripts/migrateUncategorizedPersonalTodos.ts
 *
 * Varför: 2026-08-14, Zaidas beslut (se CLAUDE.md-historiken, "Pausad
 * diskussion: auto-skapad fallback-kategori för kategorilösa todos") —
 * todosService.ts:s resolvePersonalCategoryId ger sedan 2026-08-06
 * automatiskt en samlingskategori åt varje NY vuxen-tilldelad todo som
 * sparas utan personalCategoryId. Redan existerande todos som sparades
 * FÖRE det datumet (eller på annat sätt undgått resolvern) har fortfarande
 * personalCategoryId===null. Det här skriptet kör samma upplösning en gång
 * i efterhand, via samma getOrCreateUncategorizedCollector som resolvern
 * redan använder — ingen egen, separat logik.
 *
 * Rörs INTE (samma undantag som resolvePersonalCategoryId): Familjen-poolen
 * (assignedTo===null) och barn-tilldelade todos — de ska förbli
 * kategorilösa, ett medvetet, oförändrat designval.
 *
 * Säkert att köra flera gånger — en todo som redan fått en kategori (av
 * detta skript, resolvern, eller manuellt) matchar inte längre filtret.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { MemberModel } from "../src/db/models/Member.js";
import { RoleModel } from "../src/db/models/Role.js";
import { getOrCreateUncategorizedCollector } from "../src/services/todoCategoriesService.js";

async function isChildMemberId(memberId: string | null): Promise<boolean> {
  if (!memberId) return false;
  const member = await MemberModel.findOne({ id: memberId });
  if (!member) return false;
  if (member.isChild) return true;
  const role = await RoleModel.findOne({ id: member.roleId });
  return role?.isChildRole === true;
}

async function run() {
  await connectDB();

  const todos = await TodoModel.find({
    personalCategoryId: null,
    assignedTo: { $ne: null },
    deletedAt: null
  });

  // En collector per (accountId, createdBy) — samma cache-mönster som
  // deleteCategory (todoCategoriesService.ts) redan använder, undviker en
  // findOne/create-runda per todo när flera delar samma skapare.
  const collectorsByKey = new Map<string, string>();
  let updated = 0;
  let skippedChild = 0;

  for (const todo of todos) {
    if (await isChildMemberId(todo.assignedTo)) {
      skippedChild++;
      continue;
    }

    const createdBy = todo.createdBy ?? todo.assignedTo!;
    const key = `${todo.accountId}:${createdBy}`;
    let collectorId = collectorsByKey.get(key);
    if (!collectorId) {
      const collector = await getOrCreateUncategorizedCollector(todo.accountId, createdBy, false);
      collectorId = collector.id;
      collectorsByKey.set(key, collectorId);
    }

    await TodoModel.updateOne({ id: todo.id }, { $set: { personalCategoryId: collectorId } });
    updated++;
  }

  console.log(
    `${updated} todos fick en fallback-kategori (${skippedChild} barn-tilldelade hoppades över, av ${todos.length} kategorilösa totalt).`
  );
  console.log("Klart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
