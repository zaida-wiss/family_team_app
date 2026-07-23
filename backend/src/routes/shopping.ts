import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as shopping from "../services/shoppingService.js";
import * as shoppingShares from "../services/shoppingSharesService.js";

export const shoppingRouter = Router();
shoppingRouter.use(requireAuth, attachAccountId);

shoppingRouter.get("/", async (req, res) => {
  res.json(await shopping.getAllLists(req.accountId!));
});

// Delning mellan FAMILJER (ADR-0026) — rör INTE den vanliga kontoscopade
// GET / ovan, en helt separat, additiv väg. Måste registreras FÖRE
// PATCH/DELETE-rutterna med /:id nedan, annars matchar Express "shared"
// literalt som ett listId (samma skäl som todos.ts:s /shared-children).
shoppingRouter.get("/shared-lists", async (req, res) => {
  res.json(await shopping.getExternallySharedLists(req.memberId!, req.accountId!));
});

shoppingRouter.post("/shared/:listAccountId/:id/items", async (req, res) => {
  await shopping.addItemToExternalList(req.params.id, req.params.listAccountId, req.memberId!, req.accountId!, req.body);
  res.status(201).json({ ok: true });
});

shoppingRouter.patch("/shared/:listAccountId/:id/items/:itemId/toggle", async (req, res) => {
  await shopping.toggleExternalItem(req.params.id, req.params.listAccountId, req.params.itemId, req.memberId!, req.accountId!);
  res.json({ ok: true });
});

shoppingRouter.delete("/shared/:listAccountId/:id/items/:itemId", async (req, res) => {
  await shopping.deleteExternalItem(req.params.id, req.params.listAccountId, req.params.itemId, req.memberId!, req.accountId!);
  res.json({ ok: true });
});

shoppingRouter.post("/", async (req, res) => {
  res.status(201).json(await shopping.createList(req.body, req.accountId!, req.memberId ?? null));
});

shoppingRouter.post("/:id/items", async (req, res) => {
  await shopping.addItem(req.params.id, req.accountId!, req.memberId!, req.body);
  res.status(201).json({ ok: true });
});

shoppingRouter.patch("/:id/items/:itemId/toggle", async (req, res) => {
  await shopping.toggleItem(req.params.id, req.accountId!, req.params.itemId, req.memberId ?? null);
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
  await shopping.shareList(req.params.id, req.accountId!, req.memberId ?? null, memberId, access);
  res.json({ ok: true });
});

shoppingRouter.delete("/:id/share/:memberId", async (req, res) => {
  await shopping.unshareList(req.params.id, req.accountId!, req.memberId ?? null, req.params.memberId);
  res.json({ ok: true });
});

// Dela EN inköpslista med en annan familj, icke-transitivt (ADR-0026) —
// egen väg, skild från /:id/share ovan (som bara delar INOM kontot).
shoppingRouter.get("/:id/external-share", async (req, res) => {
  res.json(await shoppingShares.listShares(req.params.id, req.accountId!, req.memberId ?? null));
});

shoppingRouter.post("/:id/external-share/lookup", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  res.json(await shoppingShares.lookupShareCandidate(req.params.id, req.accountId!, req.memberId ?? null, email));
});

shoppingRouter.post("/:id/external-share", async (req, res) => {
  const result = await shoppingShares.shareListExternally(req.params.id, req.accountId!, req.memberId ?? null, req.body);
  res.status(201).json(result);
});

shoppingRouter.delete("/:id/external-share/:granteeAccountId/:granteeMemberId", async (req, res) => {
  await shoppingShares.revokeExternalShare(
    req.params.id,
    req.accountId!,
    req.memberId ?? null,
    req.params.granteeMemberId,
    req.params.granteeAccountId
  );
  res.json({ ok: true });
});

shoppingRouter.delete("/:id", async (req, res) => {
  await shopping.deleteList(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

shoppingRouter.patch("/:id/restore", async (req, res) => {
  await shopping.restoreList(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

// ADR-0025 — permanent tömning av papperskorgen.
shoppingRouter.post("/purge-trash", async (req, res) => {
  await shopping.purgeTrash(req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});
