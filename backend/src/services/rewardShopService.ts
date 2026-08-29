import { RewardShopModel } from "../db/models/RewardShop.js";
import { PurchasedRewardModel } from "../db/models/PurchasedReward.js";
import { MemberModel } from "../db/models/Member.js";
import { TodoModel } from "../db/models/Todo.js";
import { TodoCategoryModel } from "../db/models/TodoCategory.js";
import { blockingCategories, isAvailableNow, isSamePurchasePeriod, toStockholmDateStr } from "../../../shared/rewardShopAvailability.js";
import type { PurchaseLimitPeriod } from "../../../shared/types.js";
import { RewardShopItemSchema, RewardShopItemPatchSchema } from "../../../shared/schemas.js";
import { AppError } from "../utils/errors.js";
import { validate } from "../utils/validate.js";
import { broadcastRewardShopChanged } from "../realtime/rewardShopEvents.js";
import { broadcastMembersChanged } from "../realtime/memberEvents.js";
import { writeAuditLog } from "./auditLogService.js";

// Räcker gott och väl för respektive periods eventuella veckogränser (t.ex.
// en "week"-period räknad från söndag kväll till nästa måndag) — bara en
// säker, generös nedre gräns för DB-frågan, den faktiska periodjämförelsen
// sker exakt via isSamePurchasePeriod() nedan.
const PURCHASE_LIMIT_LOOKBACK_DAYS: Record<PurchaseLimitPeriod, number> = {
  day: 2,
  week: 8,
  month: 32,
};

const PURCHASE_LIMIT_PERIOD_LABEL: Record<PurchaseLimitPeriod, string> = {
  day: "dag",
  week: "vecka",
  month: "månad",
};

// Auktoritativ köpgränsräkning (2026-08-29) — hur många gånger har DENNA
// medlem redan köpt DENNA vara inom den period varans purchaseLimit anger,
// utvärderat i familjens hemtidszon. Räknas live från PurchasedReward vid
// varje anrop (ingen denormaliserad räknare) — samma "enkelt och auktoritativt"-
// avvägning som resten av tillgänglighetsspärren.
async function countPurchasesInCurrentPeriod(
  accountId: string,
  memberId: string,
  itemId: string,
  period: PurchaseLimitPeriod,
  now: Date
): Promise<number> {
  const cutoff = new Date(now.getTime() - PURCHASE_LIMIT_LOOKBACK_DAYS[period] * 24 * 60 * 60 * 1000).toISOString();
  const recent = await PurchasedRewardModel.find(
    { accountId, memberId, itemId, deletedAt: null, purchasedAt: { $gte: cutoff } },
    { _id: 0, purchasedAt: 1 }
  );
  const nowDateStr = toStockholmDateStr(now);
  return recent.filter((r) => isSamePurchasePeriod(toStockholmDateStr(new Date(r.purchasedAt)), nowDateStr, period)).length;
}

export async function getShop(accountId: string) {
  const shop = await RewardShopModel.findOne({ accountId });
  const items = (shop?.items.filter((i) => i.deletedAt === null) ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    symbol: i.symbol,
    starCost: i.starCost,
    timerMinutes: i.timerMinutes,
    availability: i.availability,
    purchaseLimit: i.purchaseLimit ?? null,
    requiredCategories: i.requiredCategories ?? [],
    createdBy: i.createdBy,
    deletedAt: i.deletedAt,
  }));
  return { items, requireApprovalForCategories: shop?.requireApprovalForCategories ?? false };
}

export async function updateSettings(accountId: string, patch: { requireApprovalForCategories?: boolean }) {
  const update: Record<string, unknown> = {};
  if (patch.requireApprovalForCategories !== undefined) update.requireApprovalForCategories = patch.requireApprovalForCategories;
  if (Object.keys(update).length === 0) return;
  await RewardShopModel.updateOne({ accountId }, { $set: update }, { upsert: true });
  broadcastRewardShopChanged();
}

export async function addItem(accountId: string, data: unknown) {
  const item = validate(RewardShopItemSchema, data);
  await RewardShopModel.findOneAndUpdate(
    { accountId },
    { $push: { items: item } },
    { upsert: true }
  );
  broadcastRewardShopChanged();
}

export async function updateItem(accountId: string, itemId: string, data: unknown) {
  const patch = validate(RewardShopItemPatchSchema, data);
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update["items.$.title"] = patch.title;
  if (patch.symbol !== undefined) update["items.$.symbol"] = patch.symbol;
  if (patch.starCost !== undefined) update["items.$.starCost"] = patch.starCost;
  if ("timerMinutes" in patch) update["items.$.timerMinutes"] = patch.timerMinutes ?? null;
  if ("availability" in patch) update["items.$.availability"] = patch.availability ?? null;
  if ("purchaseLimit" in patch) update["items.$.purchaseLimit"] = patch.purchaseLimit ?? null;
  if (patch.requiredCategories !== undefined) update["items.$.requiredCategories"] = patch.requiredCategories;
  await RewardShopModel.updateOne({ accountId, "items.id": itemId }, { $set: update });
  broadcastRewardShopChanged();
}

export async function removeItem(accountId: string, itemId: string, memberId: string) {
  await RewardShopModel.updateOne(
    { accountId, "items.id": itemId },
    { $set: { "items.$.deletedAt": new Date().toISOString(), "items.$.deletedBy": memberId } }
  );
  broadcastRewardShopChanged();
}

// Blockerar ett NYTT köp så länge en tidigare TIDTAGEN belöning (item.timerMinutes,
// t.ex. skärmtid) fortfarande pågår (2026-08-29, Zaidas önskemål: "det skall inte
// heller gå att hämta ut en ny belöning innan föregående belöning är klar
// tidsmässigt"). Rena epoch-ms-jämförelser (startsAt + durationMinutes), ingen
// hemtidszon-hänsyn behövs — det är en löptid, inte ett kalenderdatum/veckodags-
// koncept. Belöningar UTAN timer (durationMinutes: null) är omedelbart "klara"
// vid köpet och blockerar aldrig. Om flera tidtagna belöningar råkar överlappa
// (t.ex. en admin manuellt flyttat en belöning i Inställningar) returneras den
// som slutar SIST — det är den som faktiskt avgör när nästa köp blir tillåtet.
export async function getActiveTimedReward(accountId: string, memberId: string, now = new Date()) {
  const timed = await PurchasedRewardModel.find(
    { accountId, memberId, deletedAt: null, durationMinutes: { $ne: null } },
    { _id: 0, itemTitle: 1, startsAt: 1, durationMinutes: 1 }
  );

  const nowMs = now.getTime();
  const active = timed
    .map((p) => ({
      itemTitle: p.itemTitle as string,
      endsAtMs: new Date(p.startsAt).getTime() + (p.durationMinutes as number) * 60_000,
    }))
    .filter((p) => p.endsAtMs > nowMs)
    .sort((a, b) => b.endsAtMs - a.endsAtMs)[0];

  if (!active) return null;
  return { itemTitle: active.itemTitle, remainingMinutes: Math.ceil((active.endsAtMs - nowMs) / 60_000) };
}

export async function purchaseItem(itemId: string, callerId: string, forMemberId: string) {
  const [caller, forMember] = await Promise.all([
    MemberModel.findOne({ id: callerId }),
    MemberModel.findOne({ id: forMemberId }),
  ]);

  if (!caller) throw new AppError(401, "Ej autentiserad");
  if (!forMember) throw new AppError(404, "Medlem hittades inte");

  if (callerId !== forMemberId) {
    if (caller.accountId !== forMember.accountId) throw new AppError(403, "Åtkomst nekad");
    if (caller.isChild) throw new AppError(403, "Barn får inte köpa åt andra");
    if (!forMember.isChild) throw new AppError(403, "Kan bara köpa åt barn");
  }

  const shop = await RewardShopModel.findOne({ accountId: forMember.accountId });
  const item = shop?.items.find((i) => i.id === itemId && i.deletedAt === null);
  if (!item) throw new AppError(404, "Vara hittades inte");

  // Auktoritativ tillgänglighetsspärr (2026-08-28, Sprint 10 S1) — samma
  // funktion som frontend använder för att dimma/dölja köp-knappen, men körd
  // här så ett datum-/tids-/veckodagsfönster inte längre går att kringgå
  // genom att anropa denna endpoint direkt förbi UI:t.
  if (!isAvailableNow(item)) {
    throw new AppError(409, "Belöningen är inte tillgänglig just nu");
  }

  // Auktoritativ "en tidtagen belöning i taget"-spärr (2026-08-29) — se
  // getActiveTimedReward() ovan.
  const activeTimed = await getActiveTimedReward(forMember.accountId, forMemberId);
  if (activeTimed) {
    throw new AppError(
      409,
      `Väntar på att "${activeTimed.itemTitle}" blir klar (${activeTimed.remainingMinutes} min kvar)`
    );
  }

  // Auktoritativ köpgränsspärr (2026-08-29) — samma "server är sanningen"-
  // princip som tillgänglighetsspärren ovan.
  if (item.purchaseLimit) {
    const count = await countPurchasesInCurrentPeriod(
      forMember.accountId, forMemberId, item.id, item.purchaseLimit.period, new Date()
    );
    if (count >= item.purchaseLimit.max) {
      throw new AppError(
        409,
        `Köpgränsen är nådd (max ${item.purchaseLimit.max} per ${PURCHASE_LIMIT_PERIOD_LABEL[item.purchaseLimit.period]})`
      );
    }
  }

  const availableStars = forMember.approvedStars - forMember.spentStars;
  if (availableStars < item.starCost) {
    throw new AppError(409, "Otillräckligt stjärnsaldo för köpet");
  }

  if ((item.requiredCategories ?? []).length > 0) {
    const todos = await TodoModel.find(
      { accountId: forMember.accountId, assignedTo: forMemberId, deletedAt: null },
      { _id: 0, __v: 0 }
    );
    const blocking = blockingCategories(
      item,
      todos,
      forMemberId,
      shop?.requireApprovalForCategories ?? false
    );
    if (blocking.length > 0) {
      // blockingCategories() returnerar kategori-ID:n (2026-07-08, ADR-0020)
      // — slå upp namnen för ett läsbart felmeddelande.
      const blockingCategoryDocs = await TodoCategoryModel.find(
        { id: { $in: blocking } },
        { _id: 0, name: 1 }
      );
      const names = blockingCategoryDocs.map((c) => c.name);
      throw new AppError(409, `Kategorispärr blockerar köpet: ${names.join(", ")}`);
    }
  }

  await MemberModel.updateOne({ id: forMemberId }, { $inc: { spentStars: item.starCost } });

  const now = new Date().toISOString();
  const purchased = await PurchasedRewardModel.create({
    id: `pr-${crypto.randomUUID()}`,
    accountId: forMember.accountId,
    memberId: forMemberId,
    itemId: item.id,
    itemTitle: item.title,
    itemSymbol: item.symbol ?? null,
    starCost: item.starCost,
    purchasedAt: now,
    startsAt: now,
    durationMinutes: item.timerMinutes,
    deletedAt: null,
  });

  await writeAuditLog(
    forMember.accountId,
    "reward_purchased",
    callerId,
    `Köpte "${item.title}" (${item.starCost} stjärnor)${callerId !== forMemberId ? ` åt ${forMember.name}` : ""}`
  );

  broadcastRewardShopChanged();
  broadcastMembersChanged();
  return purchased;
}

// Köpgränsstatus per vara med purchaseLimit, för en given medlem (2026-08-29)
// — konsumeras av RewardShopModal.tsx för att visa "gräns nådd"-texten och
// tona kortet, utan att skicka hela köphistoriken till klienten.
export async function getPurchaseLimitStatus(accountId: string, memberId: string) {
  const shopDoc = await RewardShopModel.findOne({ accountId });
  const limitedItems = (shopDoc?.items ?? []).filter((i) => i.deletedAt === null && i.purchaseLimit);
  const now = new Date();

  const entries = await Promise.all(
    limitedItems.map(async (item) => {
      const limit = item.purchaseLimit!;
      const count = await countPurchasesInCurrentPeriod(accountId, memberId, item.id, limit.period, now);
      return [item.id, { count, max: limit.max, period: limit.period, reached: count >= limit.max }] as const;
    })
  );

  return Object.fromEntries(entries);
}

// Ett enskilt dygn (lokalt datum, YYYY-MM-DD) — används av barnets tidslinje, som bara visar en dag åt gången
export async function getPurchasedRewardsByDate(accountId: string, date: string) {
  return PurchasedRewardModel.find(
    {
      accountId,
      deletedAt: null,
      $expr: { $eq: [{ $substrCP: ["$startsAt", 0, 10] }, date] },
    },
    { _id: 0, __v: 0 }
  );
}

// En enskild medlems köp, senaste först (2026-07-27) — till skillnad från
// getPurchasedRewardsPage nedan (paginerad över HELA kontot) behöver en
// delnings-vy (ADR-0024, utökad till "allt kopplat till barnets konto") en
// query scopad till just barnet direkt i databasen — att filtrera en
// konto-bred sida client-side hade kunnat missa barnets köp helt om andra
// familjemedlemmar köpt mer nyligen.
export async function getPurchasedRewardsForMember(accountId: string, memberId: string, limit: number) {
  return PurchasedRewardModel.find(
    { accountId, memberId, deletedAt: null },
    { _id: 0, __v: 0 }
  )
    .sort({ purchasedAt: -1 })
    .limit(limit);
}

// Offset-paginerad, senaste köp först — används av belöningsbutikens hanteringsvy (ADR-0003)
export async function getPurchasedRewardsPage(accountId: string, page: number, pageSize: number) {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    PurchasedRewardModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 })
      .sort({ purchasedAt: -1 })
      .skip(skip)
      .limit(pageSize),
    PurchasedRewardModel.countDocuments({ accountId, deletedAt: null }),
  ]);
  return { items, page, pageSize, total };
}

export async function movePurchasedReward(id: string, accountId: string, startsAt: string) {
  await PurchasedRewardModel.updateOne({ id, accountId }, { $set: { startsAt } });
  broadcastRewardShopChanged();
}

export async function deletePurchasedReward(id: string, accountId: string) {
  const pr = await PurchasedRewardModel.findOne({ id, accountId });
  if (pr) {
    await MemberModel.updateOne({ id: pr.memberId }, { $inc: { spentStars: -pr.starCost } });
    await PurchasedRewardModel.updateOne({ id }, { $set: { deletedAt: new Date().toISOString() } });
    broadcastRewardShopChanged();
    broadcastMembersChanged();
  }
}
