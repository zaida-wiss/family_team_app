import { RewardShopModel } from "../db/models/RewardShop.js";
import { PurchasedRewardModel } from "../db/models/PurchasedReward.js";
import { MemberModel } from "../db/models/Member.js";
import type { RewardShopItem } from "../../../shared/types.js";
import { AppError } from "../utils/errors.js";

export async function accountIdOf(memberId: string): Promise<string> {
  const member = await MemberModel.findOne({ id: memberId });
  if (!member) throw new AppError(404, "Medlem hittades inte");
  return member.accountId;
}

export async function getShop(memberId: string) {
  const accountId = await accountIdOf(memberId);
  const shop = await RewardShopModel.findOne({ accountId });
  return shop?.items.filter((i) => i.deletedAt === null) ?? [];
}

export async function addItem(memberId: string, item: RewardShopItem) {
  const accountId = await accountIdOf(memberId);
  await RewardShopModel.findOneAndUpdate(
    { accountId },
    { $push: { items: item } },
    { upsert: true }
  );
}

export async function removeItem(memberId: string, itemId: string) {
  const accountId = await accountIdOf(memberId);
  await RewardShopModel.updateOne(
    { accountId, "items.id": itemId },
    { $set: { "items.$.deletedAt": new Date().toISOString(), "items.$.deletedBy": memberId } }
  );
}

export async function purchaseItem(itemId: string, memberId: string) {
  const member = await MemberModel.findOne({ id: memberId });
  if (!member) throw new AppError(404, "Medlem hittades inte");

  const shop = await RewardShopModel.findOne({ accountId: member.accountId });
  const item = shop?.items.find((i) => i.id === itemId && i.deletedAt === null);
  if (!item) throw new AppError(404, "Vara hittades inte");

  await MemberModel.updateOne({ id: memberId }, { $inc: { spentStars: item.starCost } });

  const now = new Date().toISOString();
  const purchased = await PurchasedRewardModel.create({
    id: `pr-${crypto.randomUUID()}`,
    accountId: member.accountId,
    memberId,
    itemTitle: item.title,
    itemSymbol: item.symbol ?? null,
    starCost: item.starCost,
    purchasedAt: now,
    startsAt: now,
    durationMinutes: item.timerMinutes,
    deletedAt: null,
  });

  return purchased;
}

export async function getPurchasedRewards(accountId: string) {
  return PurchasedRewardModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 });
}

export async function movePurchasedReward(id: string, startsAt: string) {
  await PurchasedRewardModel.updateOne({ id }, { $set: { startsAt } });
}

export async function deletePurchasedReward(id: string) {
  const pr = await PurchasedRewardModel.findOne({ id });
  if (pr) {
    await MemberModel.updateOne({ id: pr.memberId }, { $inc: { spentStars: -pr.starCost } });
    await PurchasedRewardModel.updateOne({ id }, { $set: { deletedAt: new Date().toISOString() } });
  }
}
