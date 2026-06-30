import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as rewards from "../services/rewardsService.js";
import { accountIdOf } from "../utils/memberUtils.js";

export const rewardsRouter = Router();

rewardsRouter.get("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.json(await rewards.getAllRewards(accountId));
});

rewardsRouter.post("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.status(201).json(await rewards.createReward({ ...req.body, accountId }));
});

rewardsRouter.patch("/:id", requireAuth, async (req, res) => {
  const { title, starsNeeded } = req.body as { title?: string; starsNeeded?: number };
  await rewards.updateReward(req.params.id, { title, starsNeeded });
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/approve", requireAuth, async (req, res) => {
  await rewards.approveReward(req.params.id, req.body.starsNeeded, req.memberId ?? null);
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/reject", requireAuth, async (req, res) => {
  await rewards.rejectReward(req.params.id, req.memberId ?? null);
  res.json({ ok: true });
});

rewardsRouter.patch("/:id/redeem", requireAuth, async (req, res) => {
  await rewards.redeemReward(req.params.id);
  res.json({ ok: true });
});

rewardsRouter.delete("/:id", requireAuth, async (req, res) => {
  await rewards.deleteReward(req.params.id, req.memberId ?? null);
  res.json({ ok: true });
});
