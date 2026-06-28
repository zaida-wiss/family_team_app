import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as shop from "../services/rewardShopService.js";

export const rewardShopRouter = Router();

rewardShopRouter.get("/", requireAuth, async (req, res) => {
  res.json(await shop.getShop(req.memberId!));
});

rewardShopRouter.post("/items", requireAuth, async (req, res) => {
  await shop.addItem(req.memberId!, req.body);
  res.status(201).json({ ok: true });
});

rewardShopRouter.delete("/items/:itemId", requireAuth, async (req, res) => {
  await shop.removeItem(req.memberId!, req.params.itemId);
  res.json({ ok: true });
});

rewardShopRouter.post("/purchase/:itemId", requireAuth, async (req, res) => {
  const item = await shop.purchaseItem(req.params.itemId, req.memberId!);
  res.json(item);
});
