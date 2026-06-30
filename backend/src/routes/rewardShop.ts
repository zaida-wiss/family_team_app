import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as shop from "../services/rewardShopService.js";

export const rewardShopRouter = Router();

rewardShopRouter.get("/", requireAuth, async (req, res) => {
  res.json(await shop.getShop(req.memberId!));
});

rewardShopRouter.patch("/settings", requireAuth, async (req, res) => {
  await shop.updateSettings(req.memberId!, req.body);
  res.json({ ok: true });
});

rewardShopRouter.post("/items", requireAuth, async (req, res) => {
  await shop.addItem(req.memberId!, req.body);
  res.status(201).json({ ok: true });
});

rewardShopRouter.patch("/items/:itemId", requireAuth, async (req, res) => {
  await shop.updateItem(req.memberId!, req.params.itemId, req.body);
  res.json({ ok: true });
});

rewardShopRouter.delete("/items/:itemId", requireAuth, async (req, res) => {
  await shop.removeItem(req.memberId!, req.params.itemId);
  res.json({ ok: true });
});

rewardShopRouter.post("/purchase/:itemId", requireAuth, async (req, res) => {
  const callerId = req.memberId!;
  const forMemberId: string = req.body.forMemberId ?? callerId;
  const purchased = await shop.purchaseItem(req.params.itemId, callerId, forMemberId);
  res.json(purchased);
});

rewardShopRouter.get("/purchased", requireAuth, async (req, res) => {
  const accountId = await shop.accountIdOf(req.memberId!);
  res.json(await shop.getPurchasedRewards(accountId));
});

rewardShopRouter.patch("/purchased/:id/move", requireAuth, async (req, res) => {
  await shop.movePurchasedReward(req.params.id, req.body.startsAt);
  res.json({ ok: true });
});

rewardShopRouter.delete("/purchased/:id", requireAuth, async (req, res) => {
  await shop.deletePurchasedReward(req.params.id);
  res.json({ ok: true });
});
