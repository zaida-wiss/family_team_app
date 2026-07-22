import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as shopping from "../services/shoppingService.js";

export const shoppingRouter = Router();
shoppingRouter.use(requireAuth, attachAccountId);

shoppingRouter.get("/", async (req, res) => {
  res.json(await shopping.getAllLists(req.accountId!));
});

shoppingRouter.post("/", async (req, res) => {
  res.status(201).json(await shopping.createList({ ...req.body, accountId: req.accountId! }));
});

shoppingRouter.post("/:id/items", async (req, res) => {
  await shopping.addItem(req.params.id, req.accountId!, req.memberId!, req.body);
  res.status(201).json({ ok: true });
});

shoppingRouter.patch("/:id/items/:itemId/toggle", async (req, res) => {
  await shopping.toggleItem(req.params.id, req.accountId!, req.params.itemId);
  res.json({ ok: true });
});

shoppingRouter.delete("/:id/items/:itemId", async (req, res) => {
  await shopping.deleteItem(req.params.id, req.accountId!, req.params.itemId, req.memberId ?? null);
  res.json({ ok: true });
});

shoppingRouter.post("/:id/clear-completed", async (req, res) => {
  await shopping.clearCompletedItems(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

shoppingRouter.post("/:id/share", async (req, res) => {
  const { memberId, access } = req.body;
  await shopping.shareList(req.params.id, req.accountId!, memberId, access);
  res.json({ ok: true });
});

shoppingRouter.delete("/:id/share/:memberId", async (req, res) => {
  await shopping.unshareList(req.params.id, req.accountId!, req.params.memberId);
  res.json({ ok: true });
});

shoppingRouter.delete("/:id", async (req, res) => {
  await shopping.deleteList(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

shoppingRouter.patch("/:id/restore", async (req, res) => {
  await shopping.restoreList(req.params.id, req.accountId!);
  res.json({ ok: true });
});
