import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as rewards from "../services/rewardsService.js";
import { ApproveRewardBodySchema, RewardPatchSchema } from "../../../shared/schemas.js";

export const rewardsRouter = Router();
rewardsRouter.use(requireAuth, attachAccountId);

rewardsRouter.get("/", async (req, res) => {
  res.json(await rewards.getAllRewards(req.accountId!));
});

rewardsRouter.post("/", async (req, res) => {
  res.status(201).json(await rewards.createReward({ ...req.body, accountId: req.accountId! }));
});

rewardsRouter.patch("/:id", async (req, res) => {
  const patch = RewardPatchSchema.parse(req.body);
  await rewards.updateReward(req.params.id, req.accountId!, patch);
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/approve", async (req, res) => {
  const { starsNeeded } = ApproveRewardBodySchema.parse(req.body);
  await rewards.approveReward(req.params.id, req.accountId!, starsNeeded, req.memberId ?? null);
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/reject", async (req, res) => {
  await rewards.rejectReward(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/redeem", async (req, res) => {
  await rewards.redeemReward(req.params.id, req.accountId!);
  res.json({ ok: true });
});

rewardsRouter.delete("/:id", async (req, res) => {
  await rewards.deleteReward(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});
