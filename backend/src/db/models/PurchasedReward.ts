import { Schema, model } from "mongoose";

const schema = new Schema({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  memberId: { type: String, required: true },
  // Tillagt 2026-08-29 för köpgränsräkning (RewardShopItem.purchaseLimit) —
  // null på köp gjorda innan fältet fanns, se shared/types.ts.
  itemId: { type: String, default: null },
  itemTitle: { type: String, required: true },
  itemSymbol: { type: String, default: null },
  starCost: { type: Number, required: true },
  purchasedAt: { type: String, required: true },
  startsAt: { type: String, required: true },
  durationMinutes: { type: Number, default: null },
  deletedAt: { type: String, default: null },
});

schema.index({ accountId: 1, purchasedAt: -1 });
// Stödjer köpgränsräkningen (countPurchasesInCurrentPeriod, rewardShopService.ts) —
// filtrerar exakt på dessa fyra fält plus ett purchasedAt-intervall.
schema.index({ accountId: 1, memberId: 1, itemId: 1, purchasedAt: -1 });

export const PurchasedRewardModel = model("PurchasedReward", schema);
