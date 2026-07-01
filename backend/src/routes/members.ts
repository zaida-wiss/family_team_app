import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as members from "../services/membersService.js";
import { accountIdOf } from "../utils/memberUtils.js";

export const membersRouter = Router();

membersRouter.get("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.json(await members.getAllMembers(accountId));
});

membersRouter.post("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.status(201).json(await members.createMember(accountId, req.body));
});

membersRouter.patch("/:id", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await members.updateMember(req.params.id, accountId, req.body);
  res.json({ ok: true });
});

membersRouter.delete("/:id", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await members.deleteMember(req.params.id, accountId, req.memberId ?? null);
  res.json({ ok: true });
});

membersRouter.patch("/:id/restore", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await members.restoreMember(req.params.id, accountId);
  res.json({ ok: true });
});
