import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as rewards from "../services/rewardsService.js";

export const rewardsRouter = Router();
rewardsRouter.use(requireAuth, attachAccountId);

const rewardPatchSchema = z.object({
  title: z.string().min(1).optional(),
  starsNeeded: z.number().int().min(1).optional(),
  symbol: z.string().nullable().optional()
});

const approveRewardSchema = z.object({
  starsNeeded: z.number().int().min(1)
});

rewardsRouter.get("/", async (req, res) => {
  res.json(await rewards.getAllRewards(req.accountId!));
});

rewardsRouter.post("/", async (req, res) => {
  res.status(201).json(await rewards.createReward({ ...req.body, accountId: req.accountId! }));
});

rewardsRouter.patch("/:id", async (req, res) => {
  const patch = rewardPatchSchema.parse(req.body);
  await rewards.updateReward(req.params.id, req.accountId!, patch);
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/approve", async (req, res) => {
  const { starsNeeded } = approveRewardSchema.parse(req.body);
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
