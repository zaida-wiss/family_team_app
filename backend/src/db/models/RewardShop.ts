import { Schema, model } from "mongoose";
import type { RewardShopItem } from "../../../../shared/types.js";

type RewardShopDoc = {
  accountId: string;
  items: RewardShopItem[];
};

const timeIntervalSchema = new Schema(
  { start: { type: String, required: true }, end: { type: String, required: true } },
  { _id: false }
);

const availabilitySchema = new Schema(
  {
    startDate:     { type: String, default: null },
    endDate:       { type: String, default: null },
    timeIntervals: { type: [timeIntervalSchema], default: [] },
  },
  { _id: false }
);

const itemSchema = new Schema<RewardShopItem>(
  {
    id:           { type: String, required: true },
    title:        { type: String, required: true },
    symbol:       { type: String, default: null },
    starCost:     { type: Number, required: true },
    timerMinutes: { type: Number, default: null },
    availability: { type: availabilitySchema, default: null },
    createdBy:    { type: String, required: true },
    deletedAt:    { type: String, default: null },
  },
  { id: false }
);

const rewardShopSchema = new Schema<RewardShopDoc>(
  {
    accountId: { type: String, required: true, unique: true },
    items: [itemSchema],
  },
  { id: false }
);

export const RewardShopModel = model<RewardShopDoc>("RewardShop", rewardShopSchema);
