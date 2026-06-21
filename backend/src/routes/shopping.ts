import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { ShoppingListModel } from "../db/models/ShoppingList.js";

export const shoppingRouter = Router();

shoppingRouter.get("/", async (_request, response) => {
  const lists = await ShoppingListModel.find({}, { _id: 0, __v: 0 });
  response.json(lists);
});

shoppingRouter.post("/", requireAuth, async (request, response) => {
  const list = new ShoppingListModel(request.body);
  await list.save();
  response.status(201).json({ id: list.id });
});

shoppingRouter.post("/:id/items", requireAuth, async (request, response) => {
  const list = await ShoppingListModel.findOne({ id: request.params.id });
  if (!list) {
    response.status(404).json({ error: "Inköpslista hittades inte" });
    return;
  }
  list.items.push(request.body);
  await list.save();
  response.status(201).json({ ok: true });
});

shoppingRouter.patch("/:id/items/:itemId/toggle", requireAuth, async (request, response) => {
  const list = await ShoppingListModel.findOne({ id: request.params.id });
  if (!list) {
    response.status(404).json({ error: "Inköpslista hittades inte" });
    return;
  }
  const item = list.items.find((i) => i.id === request.params.itemId);
  if (!item) {
    response.status(404).json({ error: "Vara hittades inte" });
    return;
  }
  item.done = !item.done;
  list.markModified("items");
  await list.save();
  response.json({ ok: true });
});

shoppingRouter.post("/:id/share", requireAuth, async (request, response) => {
  const list = await ShoppingListModel.findOne({ id: request.params.id });
  if (!list) {
    response.status(404).json({ error: "Inköpslista hittades inte" });
    return;
  }
  const { memberId, access } = request.body;
  const existing = list.sharedWith.find((s) => s.memberId === memberId);
  if (existing) {
    existing.access = access;
  } else {
    list.sharedWith.push({ memberId, access });
  }
  list.markModified("sharedWith");
  await list.save();
  response.json({ ok: true });
});

shoppingRouter.delete("/:id/share/:memberId", requireAuth, async (request, response) => {
  const list = await ShoppingListModel.findOne({ id: request.params.id });
  if (!list) {
    response.status(404).json({ error: "Inköpslista hittades inte" });
    return;
  }
  list.sharedWith = list.sharedWith.filter((s) => s.memberId !== request.params.memberId);
  list.markModified("sharedWith");
  await list.save();
  response.json({ ok: true });
});

shoppingRouter.delete("/:id", requireAuth, async (request, response) => {
  const list = await ShoppingListModel.findOne({ id: request.params.id });
  if (!list) {
    response.status(404).json({ error: "Inköpslista hittades inte" });
    return;
  }
  list.deletedAt = new Date().toISOString();
  list.deletedBy = request.memberId ?? null;
  await list.save();
  response.json({ ok: true });
});

shoppingRouter.patch("/:id/restore", requireAuth, async (request, response) => {
  const list = await ShoppingListModel.findOne({ id: request.params.id });
  if (!list) {
    response.status(404).json({ error: "Inköpslista hittades inte" });
    return;
  }
  list.deletedAt = null;
  list.deletedBy = null;
  await list.save();
  response.json({ ok: true });
});
