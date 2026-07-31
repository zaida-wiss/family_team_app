import crypto from "crypto";
import { MealPlanEntryModel } from "../db/models/MealPlanEntry.js";
import { AppError } from "../utils/errors.js";
import { requireAdultMember } from "./todoCategoriesService.js";
import { MEAL_SLOTS } from "../../../shared/types.js";
import type { MealSlot } from "../../../shared/types.js";

const MEAL_SLOT_SET: ReadonlySet<string> = new Set(MEAL_SLOTS);

// Vecko-måltidsplanering (2026-07-31) — kontobrett (som Recept), mutationer
// kräver en vuxen. V1 medvetet enkel: skapa/ta bort, ingen egen PATCH — att
// byta recept på en dag+måltid görs genom att ta bort och skapa en ny rad
// (samma "enklaste CRUD"-avvägning som flera andra fält i appen).

export async function getEntriesForRange(accountId: string, fromStr: string, untilStr: string) {
  return MealPlanEntryModel.find(
    { accountId, deletedAt: null, date: { $gte: fromStr, $lte: untilStr } },
    { _id: 0, __v: 0 }
  ).sort({ date: 1 });
}

export async function createEntry(accountId: string, memberId: string | null, body: unknown) {
  await requireAdultMember(memberId, accountId);
  const b = body as { date?: unknown; mealSlot?: unknown; recipeId?: unknown };
  const date = typeof b.date === "string" ? b.date.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(400, "Ogiltigt datum");
  }
  const mealSlot = typeof b.mealSlot === "string" && MEAL_SLOT_SET.has(b.mealSlot) ? (b.mealSlot as MealSlot) : null;
  if (!mealSlot) {
    throw new AppError(400, "Ogiltig måltid");
  }
  const recipeId = typeof b.recipeId === "string" ? b.recipeId : "";
  if (!recipeId) {
    throw new AppError(400, "Recept krävs");
  }
  const entry = await MealPlanEntryModel.create({
    id: `mealplan-${crypto.randomUUID()}`,
    accountId,
    date,
    mealSlot,
    recipeId,
    createdBy: memberId,
    deletedAt: null,
    deletedBy: null
  });
  return entry.toObject();
}

export async function removeEntry(id: string, accountId: string, memberId: string | null) {
  await requireAdultMember(memberId, accountId);
  const entry = await MealPlanEntryModel.findOne({ id, accountId, deletedAt: null });
  if (!entry) {
    throw new AppError(404, "Måltidsplanraden hittades inte");
  }
  entry.deletedAt = new Date().toISOString();
  entry.deletedBy = memberId;
  await entry.save();
  return { ok: true };
}
