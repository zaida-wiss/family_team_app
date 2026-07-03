import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as shop from "../services/rewardShopService.js";
import { addRewardShopEventsClient } from "../realtime/rewardShopEvents.js";
import { PurchasedRewardsQuerySchema } from "../../../shared/schemas.js";

export const rewardShopRouter = Router();

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

rewardShopRouter.get("/", requireAuth, async (req, res) => {
  res.json(await shop.getShop(req.memberId!, req.userId!));
});

rewardShopRouter.get("/events", requireAuth, async (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  addRewardShopEventsClient(res);
});

rewardShopRouter.patch("/settings", requireAuth, async (req, res) => {
  await shop.updateSettings(req.memberId!, req.userId!, req.body);
  res.json({ ok: true });
});

rewardShopRouter.post("/items", requireAuth, async (req, res) => {
  await shop.addItem(req.memberId!, req.userId!, req.body);
  res.status(201).json({ ok: true });
});

rewardShopRouter.patch("/items/:itemId", requireAuth, async (req, res) => {
  await shop.updateItem(req.memberId!, req.userId!, req.params.itemId, req.body);
  res.json({ ok: true });
});

rewardShopRouter.delete("/items/:itemId", requireAuth, async (req, res) => {
  await shop.removeItem(req.memberId!, req.userId!, req.params.itemId);
  res.json({ ok: true });
});

rewardShopRouter.post("/purchase/:itemId", requireAuth, async (req, res) => {
  const callerId = req.memberId!;
  const forMemberId: string = req.body.forMemberId ?? callerId;
  const purchased = await shop.purchaseItem(req.params.itemId, callerId, forMemberId);
  res.json(purchased);
});

rewardShopRouter.get("/purchased", requireAuth, attachAccountId, async (req, res) => {
  const { date, page, pageSize } = PurchasedRewardsQuerySchema.parse(req.query);

  if (date) {
    res.json(await shop.getPurchasedRewardsByDate(req.accountId!, date));
    return;
  }

  const cappedPageSize = Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  res.json(await shop.getPurchasedRewardsPage(req.accountId!, page ?? 1, cappedPageSize));
});

rewardShopRouter.patch("/purchased/:id/move", requireAuth, attachAccountId, async (req, res) => {
  await shop.movePurchasedReward(req.params.id, req.accountId!, req.body.startsAt);
  res.json({ ok: true });
});

rewardShopRouter.delete("/purchased/:id", requireAuth, attachAccountId, async (req, res) => {
  await shop.deletePurchasedReward(req.params.id, req.accountId!);
  res.json({ ok: true });
});
