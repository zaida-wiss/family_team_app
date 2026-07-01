import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import * as rewards from "../services/rewardsService.js";
import { accountIdOf } from "../utils/memberUtils.js";

export const rewardsRouter = Router();

const rewardPatchSchema = z.object({
  title: z.string().min(1).optional(),
  starsNeeded: z.number().int().min(1).optional(),
  symbol: z.string().nullable().optional()
});

const approveRewardSchema = z.object({
  starsNeeded: z.number().int().min(1)
});

rewardsRouter.get("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.json(await rewards.getAllRewards(accountId));
});

rewardsRouter.post("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.status(201).json(await rewards.createReward({ ...req.body, accountId }));
});

rewardsRouter.patch("/:id", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  const patch = rewardPatchSchema.parse(req.body);
  await rewards.updateReward(req.params.id, accountId, patch);
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/approve", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  const { starsNeeded } = approveRewardSchema.parse(req.body);
  await rewards.approveReward(req.params.id, accountId, starsNeeded, req.memberId ?? null);
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/reject", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await rewards.rejectReward(req.params.id, accountId, req.memberId ?? null);
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/redeem", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await rewards.redeemReward(req.params.id, accountId);
  res.json({ ok: true });
});

rewardsRouter.delete("/:id", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await rewards.deleteReward(req.params.id, accountId, req.memberId ?? null);
  res.json({ ok: true });
});
