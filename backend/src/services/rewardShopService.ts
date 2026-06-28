import { RewardShopModel } from "../db/models/RewardShop.js";
import { MemberModel } from "../db/models/Member.js";
import type { RewardShopItem } from "../../../shared/types.js";
import { AppError } from "../utils/errors.js";

export async function getShop(accountId: string) {
  const shop = await RewardShopModel.findOne({ accountId });
  return shop?.items.filter((i) => i.deletedAt === null) ?? [];
}

export async function addItem(accountId: string, item: RewardShopItem) {
  await RewardShopModel.findOneAndUpdate(
    { accountId },
    { $push: { items: item } },
    { upsert: true }
  );
}

export async function removeItem(accountId: string, itemId: string, memberId: string) {
  await RewardShopModel.updateOne(
    { accountId, "items.id": itemId },
    { $set: { "items.$.deletedAt": new Date().toISOString(), "items.$.deletedBy": memberId } }
  );
}

export async function purchaseItem(accountId: string, itemId: string, memberId: string) {
  const shop = await RewardShopModel.findOne({ accountId });
  const item = shop?.items.find((i) => i.id === itemId && i.deletedAt === null);
  if (!item) throw new AppError(404, "Vara hittades inte");

  const member = await MemberModel.findOne({ id: memberId });
  if (!member) throw new AppError(404, "Medlem hittades inte");

  await MemberModel.updateOne(
    { id: memberId },
    { $inc: { spentStars: item.starCost } }
  );

  return item;
}
