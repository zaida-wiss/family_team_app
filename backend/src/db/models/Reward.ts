import { Schema, model } from "mongoose";
import type { Reward } from "../../../../shared/types.js";

const rewardSchema = new Schema<Reward>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, default: null },
  title: { type: String, required: true },
  wishedBy: { type: String, required: true },
  starsNeeded: { type: Number, required: true },
  status: { type: String, enum: ["suggested", "active", "unlocked", "redeemed", "rejected"], required: true },
  approvedBy: { type: String, default: null },
  approvedAt: { type: String, default: null },
  redeemedAt: { type: String, default: null },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

export const RewardModel = model<Reward>("Reward", rewardSchema);
