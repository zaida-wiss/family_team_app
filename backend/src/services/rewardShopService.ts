import { RewardShopModel } from "../db/models/RewardShop.js";
import { MemberModel } from "../db/models/Member.js";
import type { RewardShopItem } from "../../../shared/types.js";
import { AppError } from "../utils/errors.js";

async function accountIdOf(memberId: string): Promise<string> {
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
  return item;
}
