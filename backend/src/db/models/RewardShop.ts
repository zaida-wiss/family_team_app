import { Schema, model } from "mongoose";
import type { RewardShopItem } from "../../../../shared/types.js";

type RewardShopDoc = {
  accountId: string;
  items: RewardShopItem[];
  requireApprovalForCategories: boolean;
};

const timeIntervalSchema = new Schema(
  { start: { type: String, required: true }, end: { type: String, required: true } },
  { _id: false }
);

const availabilityWindowSchema = new Schema(
  {
    daysOfWeek:    { type: [String], default: [] },
    timeIntervals: { type: [timeIntervalSchema], default: [] },
  },
  { _id: false }
);

const availabilitySchema = new Schema(
  {
    startDate: { type: String, default: null },
    endDate:   { type: String, default: null },
    windows:   { type: [availabilityWindowSchema], default: [] },
  },
  { _id: false }
);

const purchaseLimitSchema = new Schema(
  {
    max:    { type: Number, required: true },
    period: { type: String, required: true },
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
    purchaseLimit: { type: purchaseLimitSchema, default: null },
    requiredCategories: { type: [String], default: [] },
    createdBy:    { type: String, required: true },
    deletedAt:    { type: String, default: null },
  },
  { id: false }
);

const rewardShopSchema = new Schema<RewardShopDoc>(
  {
    accountId: { type: String, required: true, unique: true },
    items: [itemSchema],
    requireApprovalForCategories: { type: Boolean, default: false },
  },
  { id: false }
);

export const RewardShopModel = model<RewardShopDoc>("RewardShop", rewardShopSchema);
