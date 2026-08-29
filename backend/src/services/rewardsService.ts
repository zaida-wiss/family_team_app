import { RewardModel } from "../db/models/Reward.js";
import { MemberModel } from "../db/models/Member.js";
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

// 2026-08-30, säkerhetsfynd — spreadade tidigare hela `data` (i praktiken
// hela req.body, se routes/rewards.ts) rakt in i RewardModel utan att
// begränsa VILKA fält som fick sättas. En klient kunde skicka
// status:"redeemed"/approvedBy/approvedAt/redeemedAt direkt vid skapande
// och hoppa förbi hela godkännande-flödet (samma mass-assignment-buggklass
// som ADR-0035, fixad här på samma sätt: bygg dokumentet fält för fält).
// CreateRewardBodySchema (shared/schemas.ts, validerad i routes/rewards.ts
// innan denna funktion nås) begränsar redan indata till title/starsNeeded/
// symbol/wishedBy/id — status/approvedBy/m.fl. sätts ALLTID här, oavsett
// vad body innehöll.
export async function createReward(data: unknown) {
  const input = data as { accountId: string; id: string; title: string; starsNeeded: number; symbol?: string | null; wishedBy: string };

  // wishedBy måste vara en riktig medlem i SAMMA konto — annars kan en
  // önskning peka på ett godtyckligt/felaktigt id (ren dataintegritet, inte
  // en åtkomstlucka i sig eftersom RewardModel redan är accountId-scopat,
  // men förhindrar en trasig/oanvändbar önskning i approve-flödet).
  const wisher = await MemberModel.findOne({ id: input.wishedBy, accountId: input.accountId, deletedAt: null });
  if (!wisher) throw new AppError(400, "wishedBy måste vara en medlem i samma konto");

  const reward = new RewardModel({
    id: input.id,
    accountId: input.accountId,
    title: encryptField(input.accountId, input.title),
    symbol: input.symbol ?? null,
    wishedBy: input.wishedBy,
    starsNeeded: input.starsNeeded,
    status: "suggested",
    approvedBy: null,
    approvedAt: null,
    redeemedAt: null,
    deletedAt: null,
    deletedBy: null,
  });
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
