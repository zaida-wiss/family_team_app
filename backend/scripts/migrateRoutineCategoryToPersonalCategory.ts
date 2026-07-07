/**
 * Engångsmigration: routineCategory (Hälsa/Trivsel/Pengar) → personalCategoryId (ADR-0020)
 *
 * Kör: tsx backend/scripts/migrateRoutineCategoryToPersonalCategory.ts
 *
 * Varför: Zaidas beslut 2026-07-08 — "kategorierna kan vara samma, vi behöver
 * ingen rutinkategori, det räcker med kategori" — routineCategory (det tidigare
 * separata, fasta Hälsa/Trivsel/Pengar-settet som styrde belöningsbutikens
 * kategori-spärr och barnens rutinskapare) togs bort som ett eget system.
 * Samma kontobreda TodoCategory/personalCategoryId-system (ADR-0019) används nu
 * överallt istället. Se ADR-0020.
 *
 * Vad skriptet gör, per konto som har minst en todo med routineCategory satt:
 * 1) Skapar (om den inte redan finns med exakt det namnet i kontot) en riktig
 *    TodoCategory för varje FAKTISKT använt värde ("Hälsa"/"Trivsel"/"Pengar")
 *    — ägd av kontots första vuxna medlem (bara metadata sedan ADR-0019, alla
 *    vuxna kan ändå se/redigera varandras kategorier).
 * 2) Sätter personalCategoryId på varje todo som har routineCategory men INTE
 *    redan ett personalCategoryId (rör aldrig en redan satt egen kategorisering
 *    — den vinner alltid över den gamla rutinkategorin).
 * 3) Nollställer det gamla routineCategory-fältet på de uppdaterade todo-
 *    dokumenten (schemat känner inte längre till fältet, se Todo.ts — detta
 *    städar bort det ur den råa databasen också).
 * 4) Läser om varje kontos RewardShopItem.requiredCategories (tidigare
 *    kategori-NAMN som strängar) och pekar om dem till motsvarande nya
 *    kategori-ID:n istället, så belöningsbutikens kategori-spärr fortsätter
 *    fungera precis som innan.
 *
 * Säkert att köra flera gånger — steg 2/3 rör bara todos som fortfarande har
 * ett routineCategory-fält kvar, steg 1 återanvänder en redan skapad kategori
 * med samma namn istället för att skapa en dubblett, steg 4 känner igen redan
 * migrerade kategori-ID:n (matchar inte något av de gamla namnen) och rör dem inte.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { TodoCategoryModel } from "../src/db/models/TodoCategory.js";
import { RoleModel } from "../src/db/models/Role.js";
import { MemberModel } from "../src/db/models/Member.js";
import { RewardShopModel } from "../src/db/models/RewardShop.js";

const OLD_ROUTINE_CATEGORIES = ["Hälsa", "Trivsel", "Pengar"];

type LegacyTodoDoc = {
  _id: unknown;
  id: string;
  accountId: string;
  routineCategory?: string | null;
  personalCategoryId?: string | null;
};

async function run() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Ingen databasanslutning");
  const todosRaw = db.collection<LegacyTodoDoc>("todos");

  const affected = await todosRaw
    .find({ routineCategory: { $in: OLD_ROUTINE_CATEGORIES } })
    .toArray();

  console.log(`Hittade ${affected.length} todos med ett routineCategory-fält kvar.`);

  const byAccount = new Map<string, LegacyTodoDoc[]>();
  for (const todo of affected) {
    const list = byAccount.get(todo.accountId) ?? [];
    list.push(todo);
    byAccount.set(todo.accountId, list);
  }

  let categoriesCreated = 0;
  let todosMigrated = 0;
  let todosSkippedAlreadyCategorized = 0;
  let shopItemsRemapped = 0;

  for (const [accountId, todos] of byAccount) {
    // Kategori-namn → id för just detta konto (skapas vid behov nedan).
    const nameToId = new Map<string, string>();

    const usedNames = [...new Set(todos.map((t) => t.routineCategory).filter((c): c is string => !!c))];
    for (const name of usedNames) {
      const existing = await TodoCategoryModel.findOne({ accountId, name, deletedAt: null });
      if (existing) {
        nameToId.set(name, existing.id);
        continue;
      }

      const childRoleIds = (await RoleModel.find({ accountId, isChildRole: true })).map((r) => r.id);
      const firstAdult = await MemberModel.findOne({
        accountId,
        deletedAt: null,
        isChild: { $ne: true },
        roleId: { $nin: childRoleIds }
      });
      if (!firstAdult) {
        console.warn(`  Konto ${accountId}: hittar ingen vuxen medlem att äga en ny "${name}"-kategori — hoppar över.`);
        continue;
      }

      const created = await TodoCategoryModel.create({
        id: `todo-category-${crypto.randomUUID()}`,
        accountId,
        memberId: firstAdult.id,
        name,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        deletedBy: null
      });
      nameToId.set(name, created.id);
      categoriesCreated++;
    }

    for (const todo of todos) {
      if (todo.personalCategoryId) {
        // Redan egen-kategoriserad — rör inte, ta bara bort det döda fältet.
        await todosRaw.updateOne({ _id: todo._id }, { $unset: { routineCategory: "" } });
        todosSkippedAlreadyCategorized++;
        continue;
      }
      const categoryId = todo.routineCategory ? nameToId.get(todo.routineCategory) : undefined;
      if (!categoryId) continue;
      await todosRaw.updateOne(
        { _id: todo._id },
        { $set: { personalCategoryId: categoryId }, $unset: { routineCategory: "" } }
      );
      todosMigrated++;
    }

    // Belöningsbutikens kategori-spärr (RewardShopItem.requiredCategories) —
    // pekade tidigare på kategori-NAMN, ska nu peka på kategori-ID:n.
    const shop = await RewardShopModel.findOne({ accountId });
    if (shop) {
      let shopChanged = false;
      for (const item of shop.items) {
        const remapped = item.requiredCategories.map((c) => {
          if (nameToId.has(c)) {
            shopChanged = true;
            shopItemsRemapped++;
            return nameToId.get(c) as string;
          }
          return c;
        });
        item.requiredCategories = remapped;
      }
      if (shopChanged) {
        shop.markModified("items");
        await shop.save();
      }
    }
  }

  console.log(`Klart.`);
  console.log(`  ${categoriesCreated} nya kategorier skapade.`);
  console.log(`  ${todosMigrated} todos fick personalCategoryId satt från sitt routineCategory.`);
  console.log(`  ${todosSkippedAlreadyCategorized} todos hade redan en egen kategori — routineCategory bara borttaget.`);
  console.log(`  ${shopItemsRemapped} belöningars requiredCategories-poster omskrivna från namn till id.`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
