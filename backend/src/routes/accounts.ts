import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as accountsService from "../services/accountsService.js";

export const accountsRouter = Router();

accountsRouter.post("/setup", requireAuth, async (req, res) => {
  res.status(201).json(await accountsService.setupAccount(req.userId!, req.body));
});

accountsRouter.get("/:id", async (req, res) => {
  res.json(await accountsService.getAccount(req.params.id));
});

accountsRouter.put("/:id", requireAuth, async (req, res) => {
  await accountsService.updateAccount(req.params.id, req.body);
  res.json({ ok: true });
});

accountsRouter.get("/:id/export", requireAuth, async (req, res) => {
  const data = await accountsService.exportAccount(req.params.id, req.memberId);
  res.setHeader("Content-Disposition", `attachment; filename="bmad-export-${req.params.id}.json"`);
  res.json(data);
});

accountsRouter.delete("/:id", requireAuth, async (req, res) => {
  await accountsService.deleteAccount(req.params.id, req.memberId);
  res.json({ ok: true });
});
