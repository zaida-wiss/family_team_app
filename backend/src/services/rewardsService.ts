import { RewardModel } from "../db/models/Reward.js";
import { AppError } from "../utils/errors.js";

export async function getAllRewards(accountId: string) {
  return RewardModel.find({ accountId }, { _id: 0, __v: 0 });
}

export async function createReward(data: unknown) {
  const reward = new RewardModel(data);
  await reward.save();
  return { id: reward.id };
}

export async function updateReward(id: string, patch: { title?: string; starsNeeded?: number }) {
  const reward = await RewardModel.findOne({ id });
  if (!reward || reward.deletedAt) throw new AppError(404, "Belöning hittades inte");
  if (patch.title !== undefined) reward.title = patch.title;
  if (patch.starsNeeded !== undefined) reward.starsNeeded = patch.starsNeeded;
  await reward.save();
}

export async function approveReward(id: string, starsNeeded: number, memberId: string | null) {
  const reward = await RewardModel.findOne({ id });
  if (!reward || reward.status !== "suggested") {
    throw new AppError(404, "Belöning hittades inte eller är inte suggested");
  }
  reward.status = "active";
  reward.starsNeeded = starsNeeded ?? reward.starsNeeded;
  reward.approvedBy = memberId;
  reward.approvedAt = new Date().toISOString();
  await reward.save();
}

export async function rejectReward(id: string, memberId: string | null) {
  const reward = await RewardModel.findOne({ id });
  if (!reward || reward.status !== "suggested") {
    throw new AppError(404, "Belöning hittades inte eller är inte suggested");
  }
  reward.status = "rejected";
  reward.deletedAt = new Date().toISOString();
  reward.deletedBy = memberId;
  await reward.save();
}

export async function redeemReward(id: string) {
  const reward = await RewardModel.findOne({ id });
  if (!reward || reward.status !== "unlocked") {
    throw new AppError(404, "Belöning hittades inte eller är inte unlocked");
  }
  reward.status = "redeemed";
  reward.redeemedAt = new Date().toISOString();
  await reward.save();
}

export async function deleteReward(id: string, memberId: string | null) {
  const reward = await RewardModel.findOne({ id });
  if (!reward) {
    throw new AppError(404, "Belöning hittades inte");
  }
  reward.deletedAt = new Date().toISOString();
  reward.deletedBy = memberId;
  await reward.save();
}
