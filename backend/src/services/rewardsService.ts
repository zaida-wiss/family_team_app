import { RewardModel } from "../db/models/Reward.js";
import { AppError } from "../utils/errors.js";
import { decryptField, encryptField } from "../utils/fieldEncryption.js";

export async function getAllRewards(accountId: string) {
  const rewards = await RewardModel.find({ accountId }, { _id: 0, __v: 0 }).lean();
  return rewards.map((reward) => ({ ...reward, title: decryptField(accountId, reward.title) }));
}

export async function createReward(data: unknown) {
  const input = data as { accountId: string; title: string };
  const reward = new RewardModel({ ...input, title: encryptField(input.accountId, input.title) });
  await reward.save();
  return { id: reward.id };
}

export async function updateReward(id: string, accountId: string, patch: { title?: string; starsNeeded?: number; symbol?: string | null }) {
  const reward = await RewardModel.findOne({ id, accountId });
  if (!reward || reward.deletedAt) throw new AppError(404, "Belöning hittades inte");
  if (patch.title !== undefined) reward.title = encryptField(accountId, patch.title);
  if (patch.starsNeeded !== undefined) reward.starsNeeded = patch.starsNeeded;
  if ("symbol" in patch) reward.symbol = patch.symbol ?? null;
  await reward.save();
}

export async function approveReward(id: string, accountId: string, starsNeeded: number, memberId: string | null) {
  const reward = await RewardModel.findOne({ id, accountId });
  if (!reward || reward.status !== "suggested") {
    throw new AppError(404, "Belöning hittades inte eller är inte suggested");
  }
  reward.status = "active";
  reward.starsNeeded = starsNeeded ?? reward.starsNeeded;
  reward.approvedBy = memberId;
  reward.approvedAt = new Date().toISOString();
  await reward.save();
}

export async function rejectReward(id: string, accountId: string, memberId: string | null) {
  const reward = await RewardModel.findOne({ id, accountId });
  if (!reward || reward.status !== "suggested") {
    throw new AppError(404, "Belöning hittades inte eller är inte suggested");
  }
  reward.status = "rejected";
  reward.deletedAt = new Date().toISOString();
  reward.deletedBy = memberId;
  await reward.save();
}

export async function redeemReward(id: string, accountId: string) {
  const reward = await RewardModel.findOne({ id, accountId });
  if (!reward || reward.status !== "unlocked") {
    throw new AppError(404, "Belöning hittades inte eller är inte unlocked");
  }
  reward.status = "redeemed";
  reward.redeemedAt = new Date().toISOString();
  await reward.save();
}

export async function deleteReward(id: string, accountId: string, memberId: string | null) {
  const reward = await RewardModel.findOne({ id, accountId });
  if (!reward) {
    throw new AppError(404, "Belöning hittades inte");
  }
  reward.deletedAt = new Date().toISOString();
  reward.deletedBy = memberId;
  await reward.save();
}
