import { Schema, model } from "mongoose";

const schema = new Schema({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  memberId: { type: String, required: true },
  itemTitle: { type: String, required: true },
  itemSymbol: { type: String, default: null },
  starCost: { type: Number, required: true },
  purchasedAt: { type: String, required: true },
  startsAt: { type: String, required: true },
  durationMinutes: { type: Number, default: null },
  deletedAt: { type: String, default: null },
});

export const PurchasedRewardModel = model("PurchasedReward", schema);
