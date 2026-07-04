import { RewardShopModel } from "../db/models/RewardShop.js";
import { PurchasedRewardModel } from "../db/models/PurchasedReward.js";
import { MemberModel } from "../db/models/Member.js";
import { TodoModel } from "../db/models/Todo.js";
import type { RewardShopItem } from "../../../shared/types.js";
import { blockingCategories } from "../../../shared/rewardShopAvailability.js";
import { AppError } from "../utils/errors.js";
import { broadcastRewardShopChanged } from "../realtime/rewardShopEvents.js";

export async function getShop(accountId: string) {
  const shop = await RewardShopModel.findOne({ accountId });
  const items = (shop?.items.filter((i) => i.deletedAt === null) ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    symbol: i.symbol,
    starCost: i.starCost,
    timerMinutes: i.timerMinutes,
    availability: i.availability,
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
}

export async function addItem(accountId: string, item: RewardShopItem) {
  await RewardShopModel.findOneAndUpdate(
    { accountId },
    { $push: { items: item } },
    { upsert: true }
  );
}

export async function updateItem(accountId: string, itemId: string, patch: Partial<Pick<RewardShopItem, "title" | "symbol" | "starCost" | "timerMinutes" | "availability" | "requiredCategories">>) {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update["items.$.title"] = patch.title;
  if (patch.symbol !== undefined) update["items.$.symbol"] = patch.symbol;
  if (patch.starCost !== undefined) update["items.$.starCost"] = patch.starCost;
  if ("timerMinutes" in patch) update["items.$.timerMinutes"] = patch.timerMinutes ?? null;
  if ("availability" in patch) update["items.$.availability"] = patch.availability ?? null;
  if (patch.requiredCategories !== undefined) update["items.$.requiredCategories"] = patch.requiredCategories;
  await RewardShopModel.updateOne({ accountId, "items.id": itemId }, { $set: update });
}

export async function removeItem(accountId: string, itemId: string, memberId: string) {
  await RewardShopModel.updateOne(
    { accountId, "items.id": itemId },
    { $set: { "items.$.deletedAt": new Date().toISOString(), "items.$.deletedBy": memberId } }
  );
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
      throw new AppError(409, `Kategorispärr blockerar köpet: ${blocking.join(", ")}`);
    }
  }

  await MemberModel.updateOne({ id: forMemberId }, { $inc: { spentStars: item.starCost } });

  const now = new Date().toISOString();
  const purchased = await PurchasedRewardModel.create({
    id: `pr-${crypto.randomUUID()}`,
    accountId: forMember.accountId,
    memberId: forMemberId,
    itemTitle: item.title,
    itemSymbol: item.symbol ?? null,
    starCost: item.starCost,
    purchasedAt: now,
    startsAt: now,
    durationMinutes: item.timerMinutes,
    deletedAt: null,
  });

  broadcastRewardShopChanged();
  return purchased;
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
  }
}
