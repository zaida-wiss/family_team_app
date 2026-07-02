import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as shopping from "../services/shoppingService.js";
import { accountIdOf } from "../utils/memberUtils.js";

export const shoppingRouter = Router();

shoppingRouter.get("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.json(await shopping.getAllLists(accountId));
});

shoppingRouter.post("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.status(201).json(await shopping.createList({ ...req.body, accountId }));
});

shoppingRouter.post("/:id/items", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await shopping.addItem(req.params.id, accountId, req.memberId!, req.body);
  res.status(201).json({ ok: true });
});

shoppingRouter.patch("/:id/items/:itemId/toggle", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await shopping.toggleItem(req.params.id, accountId, req.params.itemId);
  res.json({ ok: true });
});

shoppingRouter.post("/:id/share", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  const { memberId, access } = req.body;
  await shopping.shareList(req.params.id, accountId, memberId, access);
  res.json({ ok: true });
});

shoppingRouter.delete("/:id/share/:memberId", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await shopping.unshareList(req.params.id, accountId, req.params.memberId);
  res.json({ ok: true });
});

shoppingRouter.delete("/:id", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await shopping.deleteList(req.params.id, accountId, req.memberId ?? null);
  res.json({ ok: true });
});

shoppingRouter.patch("/:id/restore", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await shopping.restoreList(req.params.id, accountId);
  res.json({ ok: true });
});
