import { RewardModel } from "../db/models/Reward.js";
import { AppError } from "../utils/errors.js";
import { decryptField, encryptField } from "../utils/fieldEncryption.js";

// Fixat 2026-08-06 (samma klass av bugg som todosService.ts:s getAllTodos
// innan 2026-07-26-fixen och shoppingService.ts:s getAllLists, se CLAUDE.md)
// — filtrerade tidigare aldrig bort mjuk-raderade/nekade önskningar,
// obegränsad ackumulering över tid. Ingen restore-UI (TrashView.tsx) läser
// önskningar, och rejectReward/deleteReward nedan sätter alltid deletedAt
// samtidigt — en nekad/raderad önskning ska aldrig synas igen, bara filtreras
// bort klientsidan sen tidigare (ChildSettings.tsx). Ingen papperskorgs-
// motsvarighet behövs alltså, till skillnad från shoppingService.ts.
export async function getAllRewards(accountId: string) {
  const rewards = await RewardModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).lean();
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
