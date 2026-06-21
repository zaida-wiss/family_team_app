import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { RewardModel } from "../db/models/Reward.js";

export const rewardsRouter = Router();

rewardsRouter.get("/", async (_request, response) => {
  const rewards = await RewardModel.find({}, { _id: 0, __v: 0 });
  response.json(rewards);
});

rewardsRouter.post("/", requireAuth, async (request, response) => {
  const reward = new RewardModel(request.body);
  await reward.save();
  response.status(201).json({ id: reward.id });
});

rewardsRouter.patch("/:id/approve", requireAuth, async (request, response) => {
  const reward = await RewardModel.findOne({ id: request.params.id });
  if (!reward || reward.status !== "suggested") {
    response.status(404).json({ error: "Belöning hittades inte eller är inte suggested" });
    return;
  }
  reward.status = "active";
  reward.starsNeeded = request.body.starsNeeded ?? reward.starsNeeded;
  reward.approvedBy = request.memberId ?? null;
  reward.approvedAt = new Date().toISOString();
  await reward.save();
  response.json({ ok: true });
});

rewardsRouter.patch("/:id/reject", requireAuth, async (request, response) => {
  const reward = await RewardModel.findOne({ id: request.params.id });
  if (!reward || reward.status !== "suggested") {
    response.status(404).json({ error: "Belöning hittades inte eller är inte suggested" });
    return;
  }
  reward.status = "rejected";
  reward.deletedAt = new Date().toISOString();
  reward.deletedBy = request.memberId ?? null;
  await reward.save();
  response.json({ ok: true });
});

rewardsRouter.patch("/:id/redeem", requireAuth, async (request, response) => {
  const reward = await RewardModel.findOne({ id: request.params.id });
  if (!reward || reward.status !== "unlocked") {
    response.status(404).json({ error: "Belöning hittades inte eller är inte unlocked" });
    return;
  }
  reward.status = "redeemed";
  reward.redeemedAt = new Date().toISOString();
  await reward.save();
  response.json({ ok: true });
});

rewardsRouter.delete("/:id", requireAuth, async (request, response) => {
  const reward = await RewardModel.findOne({ id: request.params.id });
  if (!reward) {
    response.status(404).json({ error: "Belöning hittades inte" });
    return;
  }
  reward.deletedAt = new Date().toISOString();
  reward.deletedBy = request.memberId ?? null;
  await reward.save();
  response.json({ ok: true });
});
