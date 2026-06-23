import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as shopping from "../services/shoppingService.js";

export const shoppingRouter = Router();

shoppingRouter.get("/", async (_req, res) => {
  res.json(await shopping.getAllLists());
});

shoppingRouter.post("/", requireAuth, async (req, res) => {
  res.status(201).json(await shopping.createList(req.body));
});

shoppingRouter.post("/:id/items", requireAuth, async (req, res) => {
  await shopping.addItem(req.params.id, req.body);
  res.status(201).json({ ok: true });
});

shoppingRouter.patch("/:id/items/:itemId/toggle", requireAuth, async (req, res) => {
  await shopping.toggleItem(req.params.id, req.params.itemId);
  res.json({ ok: true });
});

shoppingRouter.post("/:id/share", requireAuth, async (req, res) => {
  const { memberId, access } = req.body;
  await shopping.shareList(req.params.id, memberId, access);
  res.json({ ok: true });
});

shoppingRouter.delete("/:id/share/:memberId", requireAuth, async (req, res) => {
  await shopping.unshareList(req.params.id, req.params.memberId);
  res.json({ ok: true });
});

shoppingRouter.delete("/:id", requireAuth, async (req, res) => {
  await shopping.deleteList(req.params.id, req.memberId ?? null);
  res.json({ ok: true });
});

shoppingRouter.patch("/:id/restore", requireAuth, async (req, res) => {
  await shopping.restoreList(req.params.id);
  res.json({ ok: true });
});
