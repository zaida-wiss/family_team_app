import crypto from "crypto";
import { MealPlanEntryModel } from "../db/models/MealPlanEntry.js";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
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

// Mina familjekonton (2026-08-01, Zaidas önskemål — kräver genuint
// medlemskap, se motiveringen i recipesService.ts:s getCrossAccountRecipes,
// samma princip här) — mina EGNA riktiga medlemskap i andra konton.
export async function getCrossAccountMealPlanEntries(
  callerUserId: string,
  currentAccountId: string,
  currentMemberId: string,
  fromStr: string,
  untilStr: string
) {
  const currentMember = await MemberModel.findOne({ id: currentMemberId, accountId: currentAccountId });
  const hidden = new Set(currentMember?.hiddenCrossAccountIds ?? []);

  const memberDocs = await MemberModel.find({ userId: callerUserId, deletedAt: null });
  const results = [];
  for (const m of memberDocs) {
    if (!m.accountId || m.accountId === currentAccountId || hidden.has(m.accountId)) continue;
    const account = await AccountModel.findOne({ id: m.accountId, deletedAt: null });
    // type:"personal" exkluderat (2026-08-10, ADR-0033) — se samma kommentar
    // i todosService.ts:s getCrossAccountFamilyTodos.
    if (!account || account.type === "personal") continue;
    const entries = await getEntriesForRange(m.accountId, fromStr, untilStr);
    results.push({ accountId: m.accountId, accountName: account.name, entries });
  }
  return results;
}

export async function createCrossAccountEntry(callerUserId: string, targetAccountId: string, body: unknown) {
  const memberInTarget = await MemberModel.findOne({ userId: callerUserId, accountId: targetAccountId, deletedAt: null });
  if (!memberInTarget) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return createEntry(targetAccountId, memberInTarget.id, body);
}

export async function removeCrossAccountEntry(callerUserId: string, targetAccountId: string, id: string) {
  const memberInTarget = await MemberModel.findOne({ userId: callerUserId, accountId: targetAccountId, deletedAt: null });
  if (!memberInTarget) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return removeEntry(id, targetAccountId, memberInTarget.id);
}
